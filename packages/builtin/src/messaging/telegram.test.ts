import { describe, expect, it } from "vitest";
import { GrammyError, HttpError } from "grammy";
import type { Message } from "grammy/types";
import { MessagingError } from "@asterism-app/sdk/runtime";
import { telegramError, telegramMessage } from "./telegram.ts";

const botId = 100;
const chat = { id: -5, type: "group", title: "Team" } as const;
const base = (fields: Partial<Message>): Message => ({ message_id: 1, date: 1_767_225_600, chat, ...fields }) as Message;

describe("Telegram message normalization", () => {
  // The role must follow authorship by the bot itself, not merely the presence of a sender.
  it("assigns self to the bot's messages, participant to others, and system to service messages", () => {
    const person = { id: 7, is_bot: false, first_name: "Ada" };
    const bot = { id: botId, is_bot: true, first_name: "Helper" };
    expect(telegramMessage(base({ from: bot, text: "hi" }), botId).message.sender.role).toBe("self");
    expect(telegramMessage(base({ from: person, text: "hi" }), botId).message.sender.role).toBe("participant");
    const joined = telegramMessage(base({ from: person, new_chat_members: [person] }), botId).message;
    expect(joined.sender.role).toBe("system");
    expect(joined.text).toBe("[Service message]");
  });
  // Captioned media and topics must stay addressable and readable.
  it("labels captioned media and preserves topic and reply addresses", () => {
    const normalized = telegramMessage(base({ from: { id: 7, is_bot: false, first_name: "Ada" }, photo: [], caption: "Look",
      message_thread_id: 12, reply_to_message: base({ message_id: 0, text: "earlier" }) as Message["reply_to_message"] }), botId);
    expect(normalized.message).toMatchObject({ text: "[Photo]\nLook", threadId: "12", replyTo: "0", sender: { role: "participant" } });
    expect(normalized.conversation).toMatchObject({ conversationId: "-5", threadId: "12" });
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
