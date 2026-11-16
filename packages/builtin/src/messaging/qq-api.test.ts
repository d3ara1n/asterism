import { afterEach, expect, it, vi } from "vitest";
import { QQApi } from "./qq-api.ts";

afterEach(() => vi.restoreAllMocks());

it("authenticates at the token service before making an authorized resource request", async () => {
  const requests: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    requests.push(url);
    if (url === "https://bots.qq.com/app/getAppAccessToken") {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        appId: "test-app",
        clientSecret: "test-secret",
      });
      return Response.json({ access_token: "test-token", expires_in: 7200 });
    }
    if (url === "https://api.bot.qq.com/users/@me") {
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "QQBot test-token",
      );
      return Response.json({ id: "test-bot" });
    }
    throw new Error(`Unexpected QQ request: ${url}`);
  });
  const api = new QQApi("test-app", "test-secret");
  await expect(
    api.request("GET", "/users/@me", new AbortController().signal),
  ).resolves.toEqual({ id: "test-bot" });
  expect(requests).toEqual([
    "https://bots.qq.com/app/getAppAccessToken",
    "https://api.bot.qq.com/users/@me",
  ]);
});
