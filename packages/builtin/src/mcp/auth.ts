import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { OAuthClientProvider, OAuthDiscoveryState, StoredOAuthTokens, StoredOAuthClientInformation } from "@modelcontextprotocol/client";
import type { PluginSecrets } from "@atelier/sdk/runtime";

/** OAuth 的浏览器回调只存在于当前连接生命周期；持久凭据交给宿主 vault。 */
export class McpOAuth implements OAuthClientProvider {
  private listener?: Server;
  private redirect = "";
  private verifier = "";
  private nonce = randomUUID();
  private discovery?: OAuthDiscoveryState;
  private token?: StoredOAuthTokens;
  private client?: StoredOAuthClientInformation;
  private callback?: (params: URLSearchParams) => Promise<void>;
  private authorized?: () => void;
  private completed = false;
  private port = 0;
  constructor(private readonly secrets: PluginSecrets, private readonly key: string,
    private readonly redirected: (url: string) => void, private readonly failed: (error: unknown) => void) {}
  async start(signal: AbortSignal): Promise<void> {
    const raw = await this.secrets.get(this.key);
    if (raw) {
      const saved = JSON.parse(raw) as { token?: StoredOAuthTokens; client?: StoredOAuthClientInformation; port: number };
      this.token = saved.token; this.client = saved.client; this.port = saved.port;
    }
    signal.throwIfAborted();
    this.listener = createServer((request, response) => {
      const url = new URL(request.url ?? "/", this.redirect);
      if (url.pathname !== "/callback" || url.searchParams.get("state") !== this.nonce || this.completed) {
        response.writeHead(400).end("Invalid authorization callback."); return;
      }
      if (!this.callback) { response.writeHead(503).end("Authorization is not ready."); return; }
      this.completed = true;
      const work = this.callback(url.searchParams);
      void work.then(async () => {
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", Connection: "close" });
        await new Promise<void>(resolve => response.end("Authorization completed. Return to Atelier. / 授权完成，请返回工坊。", resolve));
        await this.close(); this.authorized?.();
      }).catch(error => {
        if (!response.headersSent) response.writeHead(400).end("Authorization failed. Return to Atelier to retry. / 授权失败，请返回工坊重试。");
        this.failed(error); void this.close().catch(this.failed);
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.listener!.once("error", reject);
      this.listener!.listen(this.port, "127.0.0.1", () => { this.listener!.removeListener("error", reject); resolve(); });
    });
    const address = this.listener.address();
    if (!address || typeof address === "string") throw new Error("OAuth callback address is unavailable.");
    this.port = address.port;
    this.redirect = `http://127.0.0.1:${this.port}/callback`;
    signal.throwIfAborted();
  }
  onCallback(callback: (params: URLSearchParams) => Promise<void>, authorized: () => void) { this.callback = callback; this.authorized = authorized; }
  get redirectUrl() { return this.redirect; }
  get clientMetadata() { return { client_name: "Atelier MCP", redirect_uris: [this.redirect], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", application_type: "native" as const }; }
  state() { return this.nonce; }
  clientInformation() { return this.client; }
  async saveClientInformation(value: StoredOAuthClientInformation) { this.client = value; await this.save(); }
  tokens() { return this.token; }
  async saveTokens(value: StoredOAuthTokens) { this.token = value; await this.save(); }
  private save() { return this.secrets.set(this.key, JSON.stringify({ token: this.token, client: this.client, port: this.port })); }
  redirectToAuthorization(url: URL) { this.redirected(url.toString()); }
  saveCodeVerifier(value: string) { this.verifier = value; }
  codeVerifier() { return this.verifier; }
  saveDiscoveryState(value: OAuthDiscoveryState) { this.discovery = value; }
  discoveryState() { return this.discovery; }
  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "tokens") this.token = undefined;
    if (scope === "all" || scope === "client") this.client = undefined;
    if (scope === "all" || scope === "verifier") this.verifier = "";
    if (scope === "all" || scope === "discovery") this.discovery = undefined;
    await this.save();
  }
  async close(): Promise<void> {
    const listener = this.listener; this.listener = undefined;
    if (!listener?.listening) return;
    listener.closeAllConnections();
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  }
}
