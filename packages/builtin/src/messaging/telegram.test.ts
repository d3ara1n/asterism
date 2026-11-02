import { describe, expect, it } from "vitest";
import { Api, GrammyError, HttpError } from "grammy";
import type { Message } from "grammy/types";
import { MessagingError } from "@asterism-app/sdk/runtime";
import { telegramError, telegramFetch, telegramMessage, telegramSendsPhoto } from "./telegram.ts";

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
  // Captioned media and topics must stay addressable and readable.
  it("selects the largest photo variant and preserves its caption, topic and reply addresses", () => {
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
