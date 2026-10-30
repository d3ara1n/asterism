import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const networkMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  title: { id: "network.title", defaultMessage: "Network" },
  summary: { id: "network.summary", defaultMessage: "Proxy settings for updates, model requests, built-in web tools, and HTTP MCP connections." },
  proxy: { id: "network.proxy", defaultMessage: "Proxy" },
  mode: { id: "network.mode", defaultMessage: "Proxy mode" },
  system: { id: "network.system", defaultMessage: "System proxy" },
  direct: { id: "network.direct", defaultMessage: "Direct" },
  custom: { id: "network.custom", defaultMessage: "Custom proxy" },
  systemHint: { id: "network.systemHint", defaultMessage: "Use your operating system’s proxy settings and automatic proxy rules." },
  directHint: { id: "network.directHint", defaultMessage: "Connect without a proxy." },
  customHint: { id: "network.customHint", defaultMessage: "Use one HTTP, HTTPS, or SOCKS5 proxy for application requests." },
  server: { id: "network.server", defaultMessage: "Proxy address" },
  serverHint: { id: "network.serverHint", defaultMessage: "For example, http://127.0.0.1:7890 or socks5://127.0.0.1:1080. Proxies requiring a username and password are not supported." },
  invalidServer: { id: "network.invalidServer", defaultMessage: "Enter an HTTP, HTTPS, or SOCKS5 address with a host and optional port, without credentials or a path." },
  bypass: { id: "network.bypass", defaultMessage: "Bypass proxy for" },
  bypassHint: { id: "network.bypassHint", defaultMessage: "Separate hosts, domain patterns, or IP ranges with commas, for example *.local,192.168.0.0/16. Loopback addresses connect directly by default." },
  restartRequired: { id: "network.restartRequired", defaultMessage: "Restart Asterism to apply the saved proxy settings." },
  restartNow: { id: "network.restartNow", defaultMessage: "Restart now" },
  externalHint: { id: "network.externalHint", defaultMessage: "Terminals, external MCP processes, and plugins using their own network connections follow their own proxy configuration." },
  loadFailed: { id: "network.loadFailed", defaultMessage: "Network settings could not be loaded." },
  saveFailed: { id: "network.saveFailed", defaultMessage: "Network settings could not be saved." },
}));
