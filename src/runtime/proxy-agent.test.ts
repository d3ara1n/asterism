import { expect, it, vi } from "vitest";
import type { Dispatcher } from "undici";
import { createProxyAgent } from "./network.ts";

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("undici", async importOriginal => ({
  ...await importOriginal<typeof import("undici")>(),
  buildConnector: () => connect,
}));

it("passes a bare IPv6 proxy address to the socket connector", async () => {
  const failure = new Error("Connection stopped at the test boundary.");
  connect.mockImplementation((_options, callback) => callback(failure, null));
  const dispatcher = createProxyAgent("socks5://[::1]:1080");
  try {
    await expect(fetch("http://target.test/", { dispatcher } as RequestInit & { dispatcher: Dispatcher }))
      .rejects.toMatchObject({ cause: failure });
    expect(connect.mock.calls[0]?.[0]).toMatchObject({ hostname: "::1", host: "::1", port: 1080 });
  } finally {
    await dispatcher.destroy();
    vi.clearAllMocks();
  }
});
