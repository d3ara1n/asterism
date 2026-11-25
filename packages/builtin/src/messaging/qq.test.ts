import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, dispatchEvent } from "@tencent-connect/qqbot-nodejs/protocol";
import type { FileReferencePart } from "@asterism-app/sdk/contracts";
import { qqMessage, qqProvider, qqTarget } from "./qq.ts";
import { QQApi, qqApiError, qqResponse } from "./qq-api.ts";
import { definitelyNotSent } from "./outcome.ts";
import { ObservedMessages } from "./observed-store.ts";
import { messageObserver, observedFile } from "./provider-shared.ts";

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

  it("rejects ambiguous addresses and threads instead of sending to a different target", () => {
    expect(() => qqTarget({ conversationId: "123456" })).toThrow("c2c:<user_openid>");
    expect(() => qqTarget({ conversationId: "group:" })).toThrow("c2c:<user_openid>");
    expect(() => qqTarget({ conversationId: "c2c:user", threadId: "topic" })).toThrow("do not have threads");
  });
  it("resolves a group quote index to the observed platform message and keeps unknown references readable as missing", () => {
    const db = new DatabaseSync(":memory:");
    try {
      const store = new ObservedMessages(db, JSON.stringify(["connection", "qq", "app"]));
      const observe = messageObserver(store, () => {});
      const original = qqMessage(received("GROUP_MESSAGE_CREATE", {
        id: "original-message", group_openid: "group", author: { member_openid: "author" }, content: "Budget: 3000", timestamp,
        message_scene: { ext: ["msg_idx=opaque-reference"] },
      }), "bot")!;
      observe(original);
      const reply = qqMessage(received("GROUP_AT_MESSAGE_CREATE", {
        id: "reply-message", group_openid: "group", author: { member_openid: "reader" }, content: "Please assess", timestamp,
        message_type: 103, msg_elements: [{ msg_idx: "opaque-reference", content: "Budget…" }],
      }), "bot")!;
      expect(observe(reply).replyTo).toBe("original-message");
      expect(store.read({ conversationId: "group:group", messageIds: ["opaque-reference", "unseen-reference"] })).toMatchObject({
        messages: [{ id: "original-message", parts: [{ kind: "text", text: "Budget: 3000" }] }],
        missingIds: ["unseen-reference"],
      });
      expect(store.message("group:group", "reply-message")?.quote).toEqual({ parts: [{ kind: "text", text: "Budget…" }] });
    } finally { db.close(); }
  });

  it("retains an unseen original's quoted text and image on the reply without inventing a message or delivering another event", () => {
    const db = new DatabaseSync(":memory:");
    try {
      const account = JSON.stringify(["connection", "qq", "app"]), store = new ObservedMessages(db, account), publish = vi.fn();
      const reply = qqMessage(received("GROUP_AT_MESSAGE_CREATE", {
        id: "ROBOT1.0_reply", group_openid: "group", author: { member_openid: "reader" }, content: "What is in this picture?", timestamp,
        message_type: 103, msg_elements: [{ msg_idx: "REFIDX_original", content: "Look at this",
          attachments: [{ url: "//example.test/original.png", content_type: "image/png", filename: "original.png", size: 42 }] }],
      }), "bot")!;
      messageObserver(store, publish)(reply);
      const reopened = new ObservedMessages(db, account);
      const result = reopened.read({ conversationId: "group:group", messageIds: ["ROBOT1.0_reply", "REFIDX_original"] });
      expect(result.missingIds).toEqual(["REFIDX_original"]);
      expect(result.messages).toMatchObject([{ id: "ROBOT1.0_reply", replyTo: "REFIDX_original",
        parts: [{ kind: "text", text: "What is in this picture?" }], quote: { parts: [
          { kind: "text", text: "Look at this" },
          { kind: "file", id: "//example.test/original.png", mediaType: "image/png", filename: "original.png", size: 42 },
        ] } }]);
      expect(reopened.read({ conversationId: "group:group" }).messages.map(message => message.id)).toEqual(["ROBOT1.0_reply"]);
      expect(publish.mock.calls.filter(([event]) => event.kind === "messages.received")).toHaveLength(1);
      const query = { conversationId: "group:group", messageId: "ROBOT1.0_reply", fileId: "//example.test/original.png" };
      expect(observedFile(reopened, query).file.mediaType).toBe("image/png");
      expect(() => observedFile(reopened, { ...query, conversationId: "group:other" })).toThrow("does not belong");
      expect(() => observedFile(reopened, { ...query, messageId: "REFIDX_original" })).toThrow("does not belong");
    } finally { db.close(); }
  });

  it("keeps an image-only private quote even when QQ supplies its reference only in the scene", () => {
    const message = qqMessage(received("C2C_MESSAGE_CREATE", {
      id: "reply", author: { user_openid: "reader" }, content: "Describe it", timestamp, message_type: 103,
      message_scene: { ext: ["ref_msg_idx=REFIDX_original"] },
      msg_elements: [{ attachments: [{ url: "https://example.test/image.jpg", content_type: "image/jpeg" }] }],
    }), "bot")!.message;
    expect(message.replyTo).toBe("REFIDX_original");
    expect(message.quote).toEqual({ parts: [{ kind: "file", id: "https://example.test/image.jpg", mediaType: "image/jpeg" }] });
  });

  it("does not interpret other element-based messages or an empty quote as quoted content", () => {
    const input = { id: "message", author: { user_openid: "reader" }, content: "Current message", timestamp };
    const ordinary = qqMessage(received("C2C_MESSAGE_CREATE", {
      ...input, message_type: 101, msg_elements: [{ content: "Another element" }],
    }), "bot")!.message;
    expect(ordinary.quote).toBeUndefined();
    const empty = qqMessage(received("C2C_MESSAGE_CREATE", {
      ...input, message_type: 103, message_scene: { ext: ["ref_msg_idx=REFIDX_unavailable"] }, msg_elements: [{}],
    }), "bot")!.message;
    expect(empty.replyTo).toBe("REFIDX_unavailable");
    expect(empty.quote).toBeUndefined();
  });
});

describe("QQ outbound parts", () => {
  const signal = new AbortController().signal;
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  const image = (filename: string): FileReferencePart => ({
    kind: "file-reference", filename, ref: { source: { sessionId: "session", id: "directory", kind: "directory" }, locator: filename },
  });

  async function connect(db: DatabaseSync, transmit: (path: string, body: Record<string, unknown>) => Response) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/app/getAppAccessToken") return Response.json({ access_token: "test-token", expires_in: 7200 });
      if (path === "/users/@me") return Response.json({ id: "bot", username: "Bot" });
      return transmit(path, JSON.parse(String(init?.body)));
    });
    return qqProvider({
      db: () => db,
      files: { async *open() { yield png; } },
    }).create({ connectionId: "test", settings: { appId: "app", appSecret: "secret" }, signal, publish() {} });
  }

  it("uploads privately and delivers image, Markdown, image as separate ordered group replies", async () => {
    const db = new DatabaseSync(":memory:");
    try {
      let sent = 0, uploaded = 0;
      const transmit = vi.fn<(path: string, body: Record<string, unknown>) => Response>(path => path.endsWith("/files")
        ? Response.json({ file_info: `upload-${++uploaded}` })
        : Response.json({ id: `sent-${++sent}`, timestamp }));
      const bot = await connect(db, transmit);
      const receipt = await bot.sendMessage({ conversationId: "group:group", replyTo: "original",
        parts: [image("first.png"), { kind: "text", text: "**Caption**" }, image("second.png")] }, { signal });
      const upload = { file_type: 1, file_data: png.toString("base64"), srv_send_msg: false };
      expect(transmit.mock.calls).toMatchObject([
        ["/v2/groups/group/files", upload],
        ["/v2/groups/group/files", upload],
        ["/v2/groups/group/messages", { msg_type: 7, media: { file_info: "upload-1" }, msg_id: "original" }],
        ["/v2/groups/group/messages", { msg_type: 2, markdown: { content: "**Caption**" }, msg_id: "original" }],
        ["/v2/groups/group/messages", { msg_type: 7, media: { file_info: "upload-2" }, msg_id: "original" }],
      ]);
      expect(new Set(transmit.mock.calls.slice(2).map(([, body]) => body?.msg_seq)).size).toBe(3);
      expect(receipt.id).toBe("sent-1");
      const { messages } = await bot.readMessages({ conversationId: "group:group" }, { signal });
      expect(messages.map(message => ({ id: message.id, parts: message.parts }))).toMatchObject([
        { id: "sent-1", parts: [{ kind: "file", filename: "first.png", mediaType: "image/png" }] },
        { id: "sent-2", parts: [{ kind: "text", text: "**Caption**" }] },
        { id: "sent-3", parts: [{ kind: "file", filename: "second.png", mediaType: "image/png" }] },
      ]);
    } finally { db.close(); }
  });

  it("reports the confirmed prefix and stops after an uncertain private send", async () => {
    const db = new DatabaseSync(":memory:");
    try {
      let sent = 0;
      const transmit = vi.fn((path: string) => {
        if (path.endsWith("/files")) return Response.json({ file_info: "upload" });
        if (++sent === 1) return Response.json({ id: "confirmed", timestamp });
        throw new TypeError("Connection lost");
      });
      const bot = await connect(db, transmit);
      await expect(bot.sendMessage({ conversationId: "c2c:user", parts: [
        image("first.png"), { kind: "text", text: "Caption" }, image("last.png"),
      ] }, { signal })).rejects.toMatchObject({
        first: { id: "confirmed" },
        message: expect.stringContaining("QQ confirmed 1 of 3 messages (confirmed). Message 2 may have been sent; later messages were not attempted."),
      });
      expect(transmit.mock.calls.map(([path]) => path)).toEqual([
        "/v2/users/user/files", "/v2/users/user/files", "/v2/users/user/messages", "/v2/users/user/messages",
      ]);
      expect((await bot.readMessages({ conversationId: "c2c:user" }, { signal })).messages.map(message => message.id)).toEqual(["confirmed"]);
    } finally { db.close(); }
  });

  it("does not send even the initial text when upload preparation fails", async () => {
    const db = new DatabaseSync(":memory:");
    try {
      const transmit = vi.fn(() => Response.json({ message: "Upload unavailable" }, { status: 503 }));
      const bot = await connect(db, transmit);
      const failure = await bot.sendMessage({ conversationId: "c2c:user", parts: [
        { kind: "text", text: "Caption" }, image("first.png"),
      ] }, { signal }).catch(error => error);
      expect(definitelyNotSent(failure)).toBe(true);
      expect(transmit).toHaveBeenCalledExactlyOnceWith("/v2/users/user/files", expect.any(Object));
    } finally { db.close(); }
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
