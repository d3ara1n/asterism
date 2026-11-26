import { afterEach, expect, it, vi } from "vitest";
import { randomUUID, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigurationService } from "./service.ts";
import { applicationStorage } from "../shared/application.ts";

const network = globalThis.fetch;
afterEach(() => vi.unstubAllGlobals());

it("keeps cancelled authorization out of configuration and renews a saved grant once for concurrent model operations", async () => {
  const root = mkdtempSync(join(tmpdir(), "asterism-model-oauth-"));
  // An opaque in-memory fixture substitutes only for OS protection; network traffic goes to the loopback listener or the mock below.
  const values = new Map<string, string>();
  const service = new ConfigurationService(root, undefined, { credentialProtection: {
    async protect(value) { const handle = randomUUID(); values.set(handle, value); return handle; },
    async unprotect(handle) { return values.get(handle)!; },
  } });
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const record = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const clientId = "issued-test-client";
  let nonce: string | null = null, refreshes = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://auth.openai.com");
    if (url.pathname.endsWith("jwks.json")) return Response.json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test" }] });
    const body = init?.body as URLSearchParams;
    expect(body.get("client_id")).toBe(clientId);
    if (body.get("grant_type") === "refresh_token") {
      refreshes++;
      expect(body.get("refresh_token")).toBe("initial-refresh-token");
      return Response.json({ access_token: "renewed-access-token", refresh_token: "next-refresh-token", token_type: "Bearer", expires_in: 3600 });
    }
    const payload = `${record({ alg: "RS256", kid: "test" })}.${record({ iss: url.origin, aud: clientId, nonce, sub: "account", exp: Math.floor(Date.now() / 1000) + 600 })}`;
    return Response.json({ access_token: "initial-access-token", refresh_token: "initial-refresh-token", token_type: "Bearer", expires_in: 1,
      scope: "chatgpt.tokens.use.direct", id_token: `${payload}.${sign("RSA-SHA256", Buffer.from(payload), privateKey).toString("base64url")}` });
  });
  vi.stubGlobal("fetch", fetch);
  try {
    const start = async (id: string) => new URL((await service.execute({ type: "languageModelProvider.oauth.start", provider: "chatgpt", id, connectionId: null })).authorizationUrl!);
    const abandoned = randomUUID();
    await start(abandoned);
    await service.execute({ type: "languageModelProvider.oauth.cancel", id: abandoned });
    await expect(service.execute({ type: "languageModelProvider.oauth.finish", id: abandoned })).rejects.toThrow();
    expect(service.current().languageModelProviders).toEqual([]);

    const id = randomUUID();
    const url = await start(id);
    nonce = url.searchParams.get("nonce");
    const callback = new URL(url.searchParams.get("redirect_uri")!);
    callback.search = new URLSearchParams({ state: url.searchParams.get("state")!, code: "test-code", client_id: clientId }).toString();
    expect((await network(callback)).status).toBe(200);
    await service.execute({ type: "languageModelProvider.oauth.finish", id });
    expect(service.current().languageModelProviders).toEqual([]);
    const value = { id: "chatgpt", name: "ChatGPT", baseUrl: "http://127.0.0.1:1234/v1", protocol: "openai-responses", auth: "oauth",
      oauthProvider: "chatgpt", apiKey: "", compatibility: [], enabled: true };
    const save = (connectionId: string | null, authorization: string | null) => service.execute({ type: "languageModelProvider.save", id: connectionId, value, authorization });
    const { snapshot } = await save(null, id);
    expect(snapshot.languageModelProviders[0]).toEqual({ ...value, oauthState: "connected" });
    expect(readFileSync(join(root, applicationStorage.configurationFile), "utf8")).not.toContain("initial-refresh-token");
    const expected = { kind: "oauth", provider: "chatgpt", accessToken: "renewed-access-token" };
    expect(await Promise.all([service.executionCredential(value.id), service.executionCredential(value.id)])).toEqual([expected, expected]);
    expect(await service.executionCredential(value.id)).toEqual(expected);
    expect(refreshes).toBe(1);
    expect((await save(value.id, null)).snapshot.languageModelProviders[0]).toEqual({ ...value, oauthState: "disconnected" });
    await expect(service.executionCredential(value.id)).rejects.toThrow("credential is unavailable");
  } finally { service.close(); rmSync(root, { recursive: true, force: true }); }
});
