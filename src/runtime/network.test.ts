import { afterEach, expect, it, vi } from "vitest";
import { MockAgent, type Dispatcher } from "undici";
import { createNetworkDispatcher } from "./network.ts";

const factories = vi.hoisted(() => ({ direct: vi.fn(), proxy: vi.fn() }));
vi.mock("undici", async importOriginal => {
  const actual = await importOriginal<typeof import("undici")>();
  return {
    ...actual,
    Agent: vi.fn(function () { return factories.direct(); }),
    ProxyAgent: vi.fn(function (options: { uri: string }) { return factories.proxy(options.uri); }),
    Socks5ProxyAgent: vi.fn(function (address: string) { return factories.proxy(address); }),
  };
});
afterEach(() => vi.clearAllMocks());

function agent() {
  const value = new MockAgent();
  value.disableNetConnect();
  // MockAgent implements graceful close but not the production Agent's destroy API.
  return Object.assign(value, { destroy: () => value.close() });
}
function request(url: string, dispatcher: Dispatcher, signal?: AbortSignal) {
  return fetch(url, { dispatcher, signal } as RequestInit & { dispatcher: Dispatcher });
}

it("resolves redirect destinations independently and preserves fetch response URL and body", async () => {
  const direct = agent(), proxy = agent();
  factories.direct.mockReturnValue(direct);
  factories.proxy.mockReturnValue(proxy);
  direct.get("https://first.test").intercept({ path: "/start" })
    .reply(302, "", { headers: { location: "https://second.test/result" } });
  proxy.get("https://second.test").intercept({ path: "/result" }).reply(200, "proxied response");
  const resolve = vi.fn(async (url: string) => url === "https://first.test/start" ? "DIRECT" : "SOCKS5 proxy.test:1080");
  const network = createNetworkDispatcher(resolve);
  try {
    const response = await request("https://first.test/start", network.dispatcher);
    expect(response.url).toBe("https://second.test/result");
    expect(response.redirected).toBe(true);
    expect(await response.text()).toBe("proxied response");
    expect(resolve.mock.calls.map(([url]) => url)).toEqual(["https://first.test/start", "https://second.test/result"]);
    expect(factories.proxy).toHaveBeenCalledWith("socks5://proxy.test:1080");
  } finally { await network.close(); }
});

it("rejects a failed proxy lookup without falling back to a direct connection", async () => {
  factories.direct.mockReturnValue(agent());
  const network = createNetworkDispatcher(async () => { throw new Error("PAC resolution failed."); });
  try {
    await expect(request("https://service.test/", network.dispatcher))
      .rejects.toMatchObject({ cause: { message: "PAC resolution failed." } });
    expect(factories.proxy).not.toHaveBeenCalled();
  } finally { await network.close(); }
});

it("honors cancellation while proxy resolution is pending", async () => {
  const direct = agent();
  factories.direct.mockReturnValue(direct);
  let finish!: (value: string) => void;
  const network = createNetworkDispatcher(() => new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController();
  try {
    const response = request("https://cancelled.test/", network.dispatcher, controller.signal);
    controller.abort();
    await expect(response).rejects.toMatchObject({ name: "AbortError" });
    finish("DIRECT");
  } finally { await network.close(); }
});

it("does not create a new proxy connection after networking has stopped", async () => {
  factories.direct.mockReturnValue(agent());
  let finish!: (value: string) => void;
  const network = createNetworkDispatcher(() => new Promise(resolve => { finish = resolve; }));
  const response = request("https://service.test/", network.dispatcher);
  const failure = expect(response).rejects.toMatchObject({ cause: { message: "Application networking has stopped." } });
  await network.close();
  finish("PROXY proxy.test:8080");
  await failure;
  expect(factories.proxy).not.toHaveBeenCalled();
});
