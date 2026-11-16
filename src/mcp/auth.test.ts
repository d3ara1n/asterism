import { request } from "node:http";
import { expect, it } from "vitest";
import { McpOAuth } from "./auth.ts";

/** A real HTTP parser admits absolute request targets before the callback handler parses them as URLs. */
function callbackRequest(
  endpoint: string,
  target: string,
): Promise<{ status: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      endpoint,
      { path: target, agent: false },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.once("error", reject);
        response.once("end", () =>
          resolve({
            status: response.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    outgoing.once("error", reject);
    outgoing.end();
  });
}

// Invalid URL syntax must not escape the listener or consume the pending authorization attempt.
it("rejects a malformed OAuth callback target and completes the same attempt on a valid callback", async () => {
  const oauth = new McpOAuth(
    { get: () => null, set: () => {}, delete: () => {} },
    "fixture",
    new AbortController().signal,
  );
  await oauth.load();
  try {
    await oauth.redirectToAuthorization(
      new URL("https://example.test/authorize"),
    );
    const authorization = oauth.takeAuthorization()!;
    await authorization.start();
    expect(await callbackRequest(oauth.redirectUrl, "http://[")).toEqual({
      status: 400,
      body: "Invalid authorization callback.",
    });
    const state = oauth.state();
    expect(
      (
        await callbackRequest(
          oauth.redirectUrl,
          `/callback?state=${state}&code=fixture-code`,
        )
      ).status,
    ).toBe(200);
    expect((await authorization.callback).get("code")).toBe("fixture-code");
  } finally {
    await oauth.close();
  }
});
