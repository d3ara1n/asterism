import { randomUUID, randomBytes, createHash, createPublicKey, verify } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { OAuthProviderId } from "@asterism-app/sdk/contracts";
import { applicationBrand, applicationStorage } from "../shared/application.ts";
import type { CredentialProtection } from "../shared/credential-protection.ts";
import { ConfigurationError } from "./errors.ts";

const issuer = "https://auth.openai.com";
const resource = "https://api.openai.com/v1";
const initialClient = "dynamic_agent_client";
const path = "/auth/callback";
const scopes = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const grantSchema = z.object({
  clientId: z.string().min(1), subject: z.string().min(1),
  accessToken: z.string(), refreshToken: z.string(), expiresAt: z.number(),
});
export type OAuthGrant = z.infer<typeof grantSchema>;
const unavailable = (message: string) => new ConfigurationError("unavailable", message);
export class OAuthReauthorization extends Error {}
const tokensSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1),
  expires_in: z.number().positive(), scope: z.string().optional(), id_token: z.string().optional(), token_type: z.string() });

async function exchange(parameters: Record<string, string>, signal: AbortSignal) {
  const response = await fetch(`${issuer}/api/accounts/oauth/token`, {
    method: "POST", body: new URLSearchParams({ ...parameters, resource }), signal, redirect: "error",
  }).catch(() => { signal.throwIfAborted(); throw unavailable("Could not reach the authorization service."); });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(body);
    if (parameters.grant_type === "refresh_token" && error.success && ["invalid_grant", "invalid_refresh_token", "token_expired",
      "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused"].includes(error.data.error)) throw new OAuthReauthorization();
    throw unavailable("The authorization service rejected the token request.");
  }
  const parsed = tokensSchema.safeParse(body);
  if (!parsed.success || parsed.data.token_type.toLowerCase() !== "bearer") throw unavailable("The authorization service returned invalid credentials.");
  if ((parameters.grant_type === "authorization_code" || parsed.data.scope !== undefined)
      && !parsed.data.scope?.split(/\s+/u).includes("chatgpt.tokens.use.direct")) {
    if (parameters.grant_type === "refresh_token") throw new OAuthReauthorization();
    throw unavailable("The account did not grant ChatGPT plan usage.");
  }
  return parsed.data;
}

async function verifyIdentity(token: string | undefined, clientId: string, nonce: string, signal: AbortSignal): Promise<string> {
  try {
    const parts = token?.split(".");
    if (parts?.length !== 3) throw new Error();
    const [head, body, signature] = parts as [string, string, string];
    const json = (value: string): unknown => JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const { kid } = z.object({ alg: z.literal("RS256"), kid: z.string() }).parse(json(head));
    const response = await fetch(`${issuer}/.well-known/jwks.json`, { signal, redirect: "error" });
    if (!response.ok) throw new Error();
    const { keys } = z.object({ keys: z.array(z.looseObject({ kid: z.string().optional(), kty: z.string() })) }).parse(await response.json());
    const jwk = keys.find(key => key.kid === kid && key.kty === "RSA");
    if (!jwk || !verify("RSA-SHA256", Buffer.from(`${head}.${body}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(signature, "base64url"))) throw new Error();
    const claims = z.object({ iss: z.literal(issuer), aud: z.union([z.string(), z.array(z.string())]), azp: z.string().optional(),
      nonce: z.literal(nonce), exp: z.number(), sub: z.string().min(1) }).parse(json(body));
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audience.includes(clientId) || claims.exp * 1000 <= Date.now()
        || ((audience.length > 1 || claims.azp !== undefined) && claims.azp !== clientId)) throw new Error();
    return claims.sub;
  } catch { signal.throwIfAborted(); throw unavailable("The authorization service identity could not be verified."); }
}

function hostId(root: string) {
  const directory = join(root, applicationStorage.credentialsDirectory);
  const file = join(directory, applicationStorage.modelOAuthHostFile);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { return `urn:uuid:${z.uuid().parse(readFileSync(file, "utf8"))}`; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const id = randomUUID();
  writeFileSync(file, id, { mode: 0o600, flag: "wx" });
  return `urn:uuid:${id}`;
}

function tokenGrant(tokens: z.infer<typeof tokensSchema>, clientId: string, subject: string): OAuthGrant {
  return { clientId, subject, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
}

async function startChatGPT(root: string, previous: OAuthGrant | null, signal: AbortSignal) {
  const identifier = hostId(root), state = randomUUID(), nonce = randomUUID(), verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  let resolve!: (params: URLSearchParams) => void;
  let reject!: (error: Error) => void;
  const callback = new Promise<URLSearchParams>((done, failed) => { resolve = done; reject = failed; });
  const server = createServer((request, response) => {
    let url: URL;
    try { url = new URL(request.url ?? "/", "http://127.0.0.1"); }
    catch { response.writeHead(400).end("Invalid authorization callback."); return; }
    if (request.method !== "GET" || url.pathname !== path || url.searchParams.get("state") !== state) {
      response.writeHead(400).end("Invalid authorization callback.");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", Connection: "close" })
      .end("Authorization response received. Return to Asterism. / 已收到授权响应，请返回星图。");
    resolve(url.searchParams);
  });
  const abort = () => reject(unavailable("Authorization was cancelled or timed out."));
  const finish = callback.finally(() => { signal.removeEventListener("abort", abort); server.close(); });
  void finish.catch(() => {});
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    signal.throwIfAborted();
    signal.addEventListener("abort", abort, { once: true });
  } catch { reject(unavailable("The local authorization callback could not be opened.")); throw unavailable("The local authorization callback could not be opened."); }
  const address = server.address();
  if (!address || typeof address === "string") throw unavailable("The local authorization callback is unavailable.");
  const redirect = `http://127.0.0.1:${address.port}${path}`;
  const returning = previous?.clientId;
  const query = new URLSearchParams({ client_id: returning ?? initialClient, ext_agent_host_id: identifier,
    response_type: "code", redirect_uri: redirect, state, nonce, code_challenge: challenge, code_challenge_method: "S256",
    scope: scopes, resource, ...(!returning && { agent_name_hint: applicationBrand.en }) });
  return { url: `${issuer}/api/accounts/authorize?${query}`, grant: finish.then(async parameters => {
    signal.throwIfAborted();
    const code = parameters.get("code"), issued = parameters.get("client_id");
    const client = returning ?? issued;
    if (!code || parameters.has("error") || !client || client === initialClient || (returning && issued && issued !== returning)) {
      throw unavailable("Authorization was denied or the response was invalid.");
    }
    const tokens = await exchange({ grant_type: "authorization_code", client_id: client, code, code_verifier: verifier, redirect_uri: redirect }, signal);
    const subject = await verifyIdentity(tokens.id_token, client, nonce, signal);
    if (previous && previous.subject !== subject) throw unavailable("The signed-in account does not match this connection.");
    return tokenGrant(tokens, client, subject);
  }) };
}

const implementations = {
  chatgpt: {
    start: startChatGPT,
    async refresh(grant: OAuthGrant, signal: AbortSignal) {
      return tokenGrant(await exchange({ grant_type: "refresh_token", client_id: grant.clientId, refresh_token: grant.refreshToken }, signal), grant.clientId, grant.subject);
    },
  },
} satisfies Record<OAuthProviderId, { start: typeof startChatGPT; refresh(grant: OAuthGrant, signal: AbortSignal): Promise<OAuthGrant> }>;

type Attempt = { provider: OAuthProviderId; connectionId: string | null; controller: AbortController; grant?: Promise<OAuthGrant> };

/** Never persists an attempt. Only a completed grant can become a saved connection value. */
export class ModelOAuth {
  private readonly attempts = new Map<string, Attempt>();
  private readonly refreshes = new Map<string, Promise<OAuthGrant>>();
  constructor(private readonly root: string, private readonly protection: CredentialProtection | undefined, private readonly shutdown: AbortSignal) {}

  async start(id: string, provider: OAuthProviderId, connectionId: string | null, previous: string | undefined) {
    if (!this.protection) throw unavailable("Protected credential storage is unavailable.");
    if (this.attempts.has(id)) throw unavailable("This authorization is already in progress.");
    const controller = new AbortController();
    const attempt: Attempt = { controller, provider, connectionId };
    this.attempts.set(id, attempt);
    const timeout = AbortSignal.timeout(5 * 60_000);
    const signal = AbortSignal.any([this.shutdown, controller.signal, timeout]);
    // Release an abandoned attempt even if the editor disappears without cancelling it.
    timeout.addEventListener("abort", () => this.cancel(id), { once: true });
    try {
      const started = await implementations[provider].start(this.root, previous ? await this.read(previous) : null, signal);
      attempt.grant = started.grant;
      void started.grant.catch(() => {});
      return started.url;
    } catch (error) { this.cancel(id); throw error; }
  }
  async finish(id: string) {
    const grant = this.attempts.get(id)?.grant;
    if (!grant) throw unavailable("The authorization attempt is unavailable.");
    try { await grant; } catch (error) { this.cancel(id); throw error; }
  }
  async savedValue(id: string, provider: OAuthProviderId, connectionId: string | null) {
    const attempt = this.attempts.get(id);
    if (!attempt?.grant || attempt.provider !== provider || attempt.connectionId !== connectionId) throw unavailable("The authorization attempt is unavailable.");
    const grant = await this.protect(await attempt.grant);
    attempt.controller.signal.throwIfAborted();
    return grant;
  }
  cancel(id: string) { this.attempts.get(id)?.controller.abort(); this.attempts.delete(id); }
  private async read(value: string) {
    if (!this.protection) throw unavailable("Protected credential storage is unavailable.");
    try { return grantSchema.parse(JSON.parse(await this.protection.unprotect(value))); }
    catch { throw unavailable("The saved OAuth credential could not be read."); }
  }
  private protect(value: OAuthGrant) { return this.protection!.protect(JSON.stringify(value)); }
  async access(provider: OAuthProviderId, value: string, commit: (next: string, invalid?: true) => void, signal?: AbortSignal) {
    signal?.throwIfAborted();
    let pending = this.refreshes.get(value);
    if (!pending) {
      pending = (async () => {
        const grant = await this.read(value);
        if (grant.expiresAt > Date.now() + 60_000) return grant;
        try {
          const next = await implementations[provider].refresh(grant, AbortSignal.any([this.shutdown, AbortSignal.timeout(30_000)]));
          commit(await this.protect(next));
          return next;
        } catch (error) {
          if (error instanceof OAuthReauthorization) {
            commit(await this.protect({ ...grant, accessToken: "", refreshToken: "", expiresAt: 0 }), true);
          }
          throw error;
        }
      })().finally(() => { this.refreshes.delete(value); });
      this.refreshes.set(value, pending);
    }
    const updated = signal ? await new Promise<OAuthGrant>((resolve, reject) => {
      // Leaving one request does not cancel a token rotation needed by other requests.
      const abort = () => { cleanup(); reject(signal.reason); };
      const cleanup = () => signal.removeEventListener("abort", abort);
      pending.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    }) : await pending;
    return updated.accessToken;
  }
}
