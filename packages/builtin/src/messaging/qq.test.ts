import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, dispatchEvent } from "@tencent-connect/qqbot-nodejs/protocol";
import { qqMessage, qqTarget } from "./qq.ts";
import { QQApi, qqApiError, qqResponse } from "./qq-api.ts";
import { definitelyNotSent } from "./outcome.ts";

function received(type: string, data: unknown) {
  const result = dispatchEvent(type, data, "test-bot");
  if (result.action !== "message") throw new Error("Expected a message event.");
  return result.msg;
}

const timestamp = "2026-01-01T00:00:00Z";
afterEach(() => vi.restoreAllMocks());

describe("QQ conversation addressing", () => {
  it("keeps private and group openids distinct and uses the group rather than its author as the reply destination", () => {
    const direct = qqMessage(received("C2C_MESSAGE_CREATE", {
      id: "direct-message", author: { user_openid: "shared" }, content: "Private", timestamp,
    }), "bot")!;
    const group = qqMessage(received("GROUP_AT_MESSAGE_CREATE", {
      id: "group-message", group_openid: "shared", author: { member_openid: "member" }, content: "Group", timestamp,
    }), "bot")!;
    expect(direct.conversation.conversationId).toBe("c2c:shared");
    expect(group.conversation.conversationId).toBe("group:shared");
    expect(qqTarget({ ...group.conversation, replyTo: group.message.id })).toEqual({ scope: "group", targetId: "shared", msgId: "group-message" });
    expect(qqTarget(direct.conversation)).toEqual({ scope: "c2c", targetId: "shared", msgId: undefined });
  });

  it("receives a non-mention group message from another bot as a participant and preserves attachment facts", () => {
    const message = qqMessage(received("GROUP_MESSAGE_CREATE", {
      id: "message", group_openid: "group", author: { member_openid: "other-bot", username: "Helper", bot: true },
      content: "Report", timestamp, attachments: [{ url: "https://example.test/report.pdf", content_type: "application/pdf", filename: "report.pdf", size: 24 }],
    }), "self")!.message;
    expect(message.sender).toEqual({ id: "other-bot", name: "Helper", role: "participant" });
    expect(message.parts).toEqual([
      { kind: "text", text: "Report" },
      { kind: "file", id: "https://example.test/report.pdf", mediaType: "application/pdf", filename: "report.pdf", size: 24 },
    ]);
  });

  it("rejects ambiguous addresses and topics instead of sending to a different target", () => {
    expect(() => qqTarget({ conversationId: "123456" })).toThrow("c2c:<user_openid>");
    expect(() => qqTarget({ conversationId: "group:" })).toThrow("c2c:<user_openid>");
    expect(() => qqTarget({ conversationId: "c2c:user", threadId: "topic" })).toThrow("do not have topics");
  });
});

describe("QQ platform failures", () => {
  it("reports an authentication outage as definitely unsent while connection creation can still retry", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ message: "Unavailable" }, { status: 503 }));
    const api = new QQApi("app", "secret"), signal = new AbortController().signal;
    const sendError = await api.send("/v2/users/user/messages", signal, { content: "Hello" }).catch(error => error);
    expect(definitelyNotSent(sendError)).toBe(true);
    expect(sendError).toMatchObject({ code: "request_failed", message: expect.stringContaining("Unavailable") });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(api.accessToken(signal)).rejects.toMatchObject({ code: "request_failed" });
  });

  it("keeps a message request failure ambiguous after authentication succeeded", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ access_token: "test-token", expires_in: 7200 }))
      .mockRejectedValueOnce(new TypeError("Connection lost"));
    const error = await new QQApi("app", "secret").send("/v2/users/user/messages", new AbortController().signal, { content: "Hello" }).catch(error => error);
    expect(error).toMatchObject({ message: "Connection lost" });
    expect(definitelyNotSent(error)).toBe(false);
  });

  it("recognizes invalid credentials carried by HTTP 200 without parsing diagnostic text", async () => {
    await expect(qqResponse(Response.json({ code: 100016, message: "Invalid credentials" }), "/app/getAppAccessToken"))
      .rejects.toMatchObject({ code: "unavailable", message: expect.stringContaining("100016") });
  });

  it("preserves a platform permission refusal and treats it as definitely not sent", async () => {
    const error = await qqResponse(Response.json({ code: 304023, message: "Permission denied" }, { status: 403 }), "/v2/groups/group/messages").catch(error => error);
    expect(error).toMatchObject({ code: "unavailable", message: expect.stringContaining("Permission denied") });
    expect(definitelyNotSent(error)).toBe(true);
  });

  it("uses the platform retry delay for a refused request", async () => {
    const error = await qqResponse(Response.json({ code: 100001, message: "Too many requests" }, { status: 429, headers: { "Retry-After": "7" } }), "/gateway").catch(error => error);
    expect(error).toMatchObject({ code: "request_failed", retryAfterMs: 7000 });
    expect(definitelyNotSent(error)).toBe(true);
  });

  it("keeps network, server, and malformed success responses ambiguous after a send", async () => {
    expect(definitelyNotSent(qqApiError(new ApiError("Connection lost", 0, "/messages")))).toBe(false);
    const server = await qqResponse(Response.json({ code: 500, message: "Server error" }, { status: 500 }), "/messages").catch(error => error);
    const malformed = await qqResponse(new Response("<html>Gateway error</html>"), "/messages").catch(error => error);
    expect(server).toMatchObject({ code: "request_failed" });
    expect(definitelyNotSent(server)).toBe(false);
    expect(definitelyNotSent(malformed)).toBe(false);
  });
});
