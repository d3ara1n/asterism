import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { Api, GrammyError, HttpError } from "grammy";
import type { Message } from "grammy/types";
import { MessagingError } from "@asterism-app/sdk/runtime";
import { telegramError, telegramFetch, telegramMessage, telegramSendsPhoto } from "./telegram.ts";
import { ObservedMessages } from "./observed-store.ts";
import { observedFile } from "./provider-shared.ts";

const botId = 100;
const chat = { id: -5, type: "group", title: "Team" } as const;
const base = (fields: Partial<Message>): Message => ({ message_id: 1, date: 1_767_225_600, chat, ...fields }) as Message;

describe("Telegram message normalization", () => {
  // The role must follow authorship by the bot itself, not merely the presence of a sender.
  it("assigns self to the bot's messages, participant to others, and system to service messages", () => {
    const person = { id: 7, is_bot: false, first_name: "Ada" };
    const bot = { id: botId, is_bot: true, first_name: "Helper" };
    expect(telegramMessage(base({ from: bot, text: "hi" }), botId).message.sender.role).toBe("self");
    expect(telegramMessage(base({ from: bot, pinned_message: base({ text: "Pinned" }) }), botId).message.sender.role).toBe("self");
    expect(telegramMessage(base({ from: person, text: "hi" }), botId).message.sender.role).toBe("participant");
    const joined = telegramMessage(base({ from: person, new_chat_members: [person] }), botId).message;
    expect(joined.sender.role).toBe("system");
    expect(joined.parts).toEqual([{ kind: "text", text: "[Service message]" }]);
  });
  // Captioned media and threads must stay addressable and readable.
  it("selects the largest photo variant and preserves its caption, thread and reply addresses", () => {
    const normalized = telegramMessage(base({ from: { id: 7, is_bot: false, first_name: "Ada" }, photo: [
      { file_id: "large", file_unique_id: "u1", width: 800, height: 600 },
      { file_id: "small", file_unique_id: "u2", width: 80, height: 60 },
    ], caption: "Look",
      message_thread_id: 12, reply_to_message: base({ message_id: 0, text: "earlier" }) as Message["reply_to_message"] }), botId);
    expect(normalized.message).toMatchObject({ parts: [{ kind: "text", text: "Look" },
      { kind: "file", id: "large", mediaType: "image/jpeg" }], threadId: "12", replyTo: "0", sender: { role: "participant" } });
    expect(normalized.conversation).toMatchObject({ conversationId: "-5", threadId: "12" });
  });
});

describe("Telegram quoted content", () => {
  const photo = [
    { file_id: "small", file_unique_id: "small-unique", width: 80, height: 60 },
    { file_id: "large", file_unique_id: "large-unique", width: 800, height: 600, file_size: 42 },
  ];
  it("keeps an original's caption and largest photo in the reply separately from its own content", () => {
    const original = base({ message_id: 41, caption: "A mountain", photo });
    const { message } = telegramMessage(base({
      message_id: 42, text: "Where is this?", reply_to_message: original as Message["reply_to_message"],
    }), botId);
    expect(message.replyTo).toBe("41");
    expect(message.parts).toEqual([{ kind: "text", text: "Where is this?" }]);
    expect(message.quote).toEqual({ parts: [
      { kind: "text", text: "A mountain" },
      { kind: "file", id: "large", mediaType: "image/jpeg", filename: "photo.jpg", size: 42 },
    ] });
  });
  it("uses the selected caption fragment while preserving the complete original and its image", () => {
    const original = base({ message_id: 41, caption: "A mountain beside a lake", photo });
    const input = base({ message_id: 42, text: "Explain",
      reply_to_message: original as Message["reply_to_message"], quote: { text: "beside a lake", position: 11, is_manual: true } });
    const { message } = telegramMessage(input, botId);
    expect(message.quote?.parts).toEqual([
      { kind: "text", text: "beside a lake" },
      { kind: "file", id: "large", mediaType: "image/jpeg", filename: "photo.jpg", size: 42 },
    ]);
    expect(telegramMessage(original, botId).message.parts[0]).toEqual({ kind: "text", text: "A mountain beside a lake" });
  });
  it.each([
    { id: -10, type: "supergroup" as const, title: "Other chat" },
    { ...chat, type: "supergroup" as const },
  ])("retains an external image under the reply without interpreting source chat $id as the current thread", externalChat => {
    const db = new DatabaseSync(":memory:");
    try {
      const store = new ObservedMessages(db, "telegram-quotes");
      const normalized = telegramMessage(base({ message_id: 42, message_thread_id: 12, text: "Look",
        external_reply: { origin: { type: "hidden_user", sender_user_name: "Someone", date: 1_767_225_500 },
          chat: externalChat, message_id: 41, photo },
      }), botId);
      store.observe(normalized.conversation, normalized.message);
      const { messages, missingIds } = store.read({ conversationId: "-5", threadId: "12", messageIds: ["42", "41"] });
      expect(missingIds).toEqual(["41"]);
      expect(messages[0]?.replyTo).toBeUndefined();
      expect(messages[0]?.quote).toEqual({ parts: [
        { kind: "file", id: "large", mediaType: "image/jpeg", filename: "photo.jpg", size: 42 },
      ] });
      const query = { conversationId: "-5", threadId: "12", messageId: "42", fileId: "large" };
      expect(observedFile(store, query).file.id).toBe("large");
      expect(() => observedFile(store, { ...query, threadId: "99" })).toThrow("does not belong");
      expect(store.list({}).conversations.map(conversation => conversation.conversationId)).toEqual(["-5"]);
    } finally { db.close(); }
  });
  it("retains an external text quotation without requiring an original chat or message ID", () => {
    const { message } = telegramMessage(base({ text: "Discuss this",
      quote: { text: "Selected words", position: 20 },
      external_reply: { origin: { type: "hidden_user", sender_user_name: "Someone", date: 1_767_225_500 } },
    }), botId);
    expect(message.quote).toEqual({ parts: [{ kind: "text", text: "Selected words" }] });
    expect(message.replyTo).toBeUndefined();
  });
  it("leaves an external reference without supplied text or supported media empty", () => {
    const { message } = telegramMessage(base({ text: "Discuss this",
      external_reply: { origin: { type: "hidden_user", sender_user_name: "Someone", date: 1_767_225_500 } },
    }), botId);
    expect(message.quote).toBeUndefined();
    expect(message.replyTo).toBeUndefined();
  });
});

describe("Telegram error classification", () => {
  const api = (error_code: number, parameters = {}) =>
    new GrammyError("failed", { ok: false, error_code, description: `code ${error_code}`, parameters }, "getUpdates", {});
  // Rate limits must honour Telegram's delay; conflicts and rejected tokens must not be retried forever.
  it("separates transient failures from terminal ones", () => {
    expect(telegramError(api(429, { retry_after: 3 }))).toMatchObject({ code: "request_failed", retryAfterMs: 3000 });
    expect(telegramError(api(502))).toMatchObject({ code: "request_failed" });
    expect(telegramError(api(409))).toMatchObject({ code: "unavailable" });
    expect(telegramError(api(401))).toMatchObject({ code: "unavailable" });
    expect(telegramError(api(400))).toMatchObject({ code: "invalid_input" });
    expect(telegramError(new HttpError("offline", new Error("ECONNRESET")))).toBeInstanceOf(MessagingError);
    expect(telegramError(new HttpError("offline", new Error("ECONNRESET")))).toMatchObject({ code: "request_failed" });
  });
});

describe("Telegram transport", () => {
  // grammY's Node build passes its abort-controller shim signal to fetch; native fetch rejects it, so getMe never succeeded.
  it("runs grammY requests on a fetch that requires native signals and forwards cancellation in flight", async () => {
    let hold = false;
    const strict: typeof fetch = async (_input, init) => {
      const signal = init?.signal;
      if (!(signal instanceof AbortSignal)) throw new TypeError("Expected signal to be an instance of AbortSignal.");
      // A held request settles only through cancellation, so it observes whether the caller's abort reaches native fetch.
      if (hold) return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      return Response.json({ ok: true, result: { id: botId, is_bot: true, first_name: "Helper", username: "helper" } });
    };
    const api = new Api("token", { fetch: telegramFetch(strict) });
    expect((await api.getMe()).username).toBe("helper");
    hold = true;
    const controller = new AbortController();
    const pending = api.getMe(controller.signal as never);
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});

describe("Telegram upload method", () => {
  // sendPhoto rejects GIFs and files over 10 MB, so those must go through sendDocument.
  it("sends still images within the photo limit as photos and everything else as documents", () => {
    expect(telegramSendsPhoto({ filename: "shot.PNG" }, 1024)).toBe(true);
    expect(telegramSendsPhoto({ mediaType: "image/jpeg" }, 1024)).toBe(true);
    expect(telegramSendsPhoto({ filename: "large.jpg" }, 11 * 1024 * 1024)).toBe(false);
    expect(telegramSendsPhoto({ filename: "loop.gif" }, 1024)).toBe(false);
    expect(telegramSendsPhoto({ filename: "notes.pdf", mediaType: "application/pdf" }, 1024)).toBe(false);
    expect(telegramSendsPhoto({}, 1024)).toBe(false);
  });
});
