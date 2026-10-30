import { Agent, ProxyAgent, Socks5ProxyAgent, buildConnector, type Dispatcher } from "undici";
import { resolvedProxyAddress } from "../shared/network.ts";

export function createProxyAgent(address: string): Dispatcher {
  if (!address.startsWith("socks5:")) return new ProxyAgent({ uri: address, proxyTunnel: false });
  const connect = buildConnector({});
  return new Socks5ProxyAgent(address, {
    connect(options, callback) {
      // URI hostnames retain IPv6 brackets; socket hostnames use the bare address.
      const hostname = options.hostname.startsWith("[") ? options.hostname.slice(1, -1) : options.hostname;
      connect({ ...options, hostname, host: hostname }, callback);
    },
  });
}

/** Keep Node fetch semantics while routing each URL, including redirects, through Chromium's proxy decision. */
export function createNetworkDispatcher(resolve: (url: string) => Promise<string>) {
  const direct = new Agent();
  const proxies = new Map<string, Dispatcher>();
  let closed = false;
  const dispatcher = direct.compose(() => (options, handler) => {
    void (async () => {
      const url = `${new URL(options.origin!).origin}${options.path}`;
      const address = resolvedProxyAddress(await resolve(url));
      if (closed) throw new Error("Application networking has stopped.");
      let target: Dispatcher = direct;
      if (address) {
        let proxy = proxies.get(address);
        if (!proxy) { proxy = createProxyAgent(address); proxies.set(address, proxy); }
        target = proxy;
      }
      target.dispatch(options, handler);
    })().catch(error => {
      // Like Undici's asynchronous DNS interceptor, no controller exists before connection.
      handler.onResponseError?.(null!, error instanceof Error ? error : new Error(String(error)));
    });
    return true;
  });
  return {
    dispatcher,
    async close() {
      closed = true;
      await Promise.all([direct, ...proxies.values()].map(agent => agent.destroy()));
    },
  };
}
