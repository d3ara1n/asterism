import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { OAuthClientProvider, OAuthDiscoveryState, StoredOAuthTokens, StoredOAuthClientInformation } from "@modelcontextprotocol/client";
import type { McpSecrets } from "./environment.ts";

const savedSchema = z.object({
  token: z.looseObject({ access_token: z.string(), token_type: z.string() }).optional(),
  client: z.looseObject({ client_id: z.string() }).optional(),
  port: z.number().int().min(1).max(65_535).optional(),
});

/** Selects an available local port; determines the callback address before client registration, then persists it for reuse. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => typeof address === "object" && address ? resolve(address.port) : reject(new Error("No local port is available.")));
    });
  });
}

const AUTHORIZATION_TIMEOUT_MS = 5 * 60_000;

export interface AuthorizationRequest {
  url: string;
  callback: Promise<URLSearchParams>;
  expiresAt: number | null;
  start(): Promise<void>;
}

/**
 * OAuth provider for one connection transition. Persistent state (client registration, tokens, and callback port) is saved in the host vault;
 * the PKCE verifier, discovery, and state belong to this authorization attempt. Settings starts the callback listener before opening the browser.
 * The connection transition owns authorization; replacing a transport does not close the listener.
 * Once interactive is disabled, expired tokens no longer trigger browser authorization; the caller closes the connection and authorizes again on the next connection.
 */
export class McpOAuth implements OAuthClientProvider {
  private listener?: Server;
  private closing?: Promise<void>;
  private verifier = "";
  private readonly nonce = randomUUID();
  private discovery?: OAuthDiscoveryState;
  private token?: StoredOAuthTokens;
  private client?: StoredOAuthClientInformation;
  private port = 0;
  private pending?: AuthorizationRequest;
  private cancelAuthorization?: (reason: unknown) => void;
  interactive = true;
  constructor(private readonly secrets: McpSecrets, private readonly key: string, private readonly signal: AbortSignal) {}

  async load(): Promise<void> {
    const raw = await this.secrets.get(this.key);
    if (raw) {
      const saved = savedSchema.safeParse(JSON.parse(raw));
      if (!saved.success) throw new Error("Saved MCP authorization is invalid. Reset authorization in MCP settings.");
      this.token = saved.data.token as StoredOAuthTokens | undefined;
      this.client = saved.data.client as StoredOAuthClientInformation | undefined;
      this.port = saved.data.port ?? 0;
    }
    if (!this.port) this.port = await freePort();
    this.signal.throwIfAborted();
  }
  /** Authorization request delivered by redirectToAuthorization; cleared after each read, with the next connection round reevaluating whether authorization is needed. */
  takeAuthorization(): AuthorizationRequest | undefined { const request = this.pending; this.pending = undefined; return request; }

  get redirectUrl() { return `http://127.0.0.1:${this.port}/callback`; }
  get clientMetadata() {
    return { client_name: "Asterism", redirect_uris: [this.redirectUrl], grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"], token_endpoint_auth_method: "none", application_type: "native" as const };
  }
  state() { return this.nonce; }
  clientInformation() { return this.client; }
  async saveClientInformation(value: StoredOAuthClientInformation) { this.client = value; await this.save(); }
  tokens() { return this.token; }
  async saveTokens(value: StoredOAuthTokens) { this.token = value; await this.save(); }
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
  private save() { return this.secrets.set(this.key, JSON.stringify({ token: this.token, client: this.client, port: this.port })); }

  async redirectToAuthorization(url: URL): Promise<void> {
    if (!this.interactive) throw new Error("MCP authorization expired. The next connection starts a new authorization.");
    await this.close();
    this.signal.throwIfAborted();
    let deliver!: (params: URLSearchParams) => void, fail!: (error: unknown) => void;
    const callback = new Promise<URLSearchParams>((resolve, reject) => { deliver = resolve; fail = reject; });
    let timer: ReturnType<typeof setTimeout> | undefined, starting: Promise<void> | undefined;
    const abort = () => fail(this.signal.reason);
    this.cancelAuthorization = fail;
    this.signal.addEventListener("abort", abort, { once: true });
    void callback.finally(async () => {
      clearTimeout(timer);
      this.signal.removeEventListener("abort", abort);
      this.cancelAuthorization = undefined;
      await this.close();
    }).catch(() => {});
    const authorization: AuthorizationRequest = {
      url: url.toString(), callback, expiresAt: null,
      start: () => starting ??= (async () => {
        this.signal.throwIfAborted();
        const listener = createServer((request, response) => {
          const received = new URL(request.url ?? "/", this.redirectUrl);
          if (received.pathname !== "/callback" || received.searchParams.get("state") !== this.nonce) {
            response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Invalid authorization callback."); return;
          }
          response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", Connection: "close" })
            .end("Authorization response received. Return to Asterism. / 已收到授权响应，请返回星图。",
              () => deliver(received.searchParams));
        });
        await new Promise<void>((resolve, reject) => {
          listener.once("error", error => reject((error as NodeJS.ErrnoException).code === "EADDRINUSE"
            ? new Error(`OAuth callback port ${this.port} is in use. Reset authorization in MCP settings to choose another port.`) : error));
          listener.listen(this.port, "127.0.0.1", () => resolve());
        });
        this.listener = listener;
        this.signal.throwIfAborted();
        authorization.expiresAt = Date.now() + AUTHORIZATION_TIMEOUT_MS;
        timer = setTimeout(() => fail(new Error("MCP authorization timed out. Start authorization again in MCP settings.")), AUTHORIZATION_TIMEOUT_MS);
      })().catch(async error => { fail(error); await this.close(); throw error; }),
    };
    this.pending = authorization;
  }
  async close(): Promise<void> {
    this.cancelAuthorization?.(new Error("MCP authorization was cancelled."));
    this.cancelAuthorization = undefined;
    this.pending = undefined;
    const listener = this.listener; this.listener = undefined;
    if (!listener?.listening) return this.closing;
    listener.closeAllConnections();
    await (this.closing = new Promise<void>(resolve => listener.close(() => resolve())));
  }
}
