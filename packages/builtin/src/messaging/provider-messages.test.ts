import { describe, expect, it } from "vitest";
import { discordMessage, restChannel, type DiscordChannel, type DiscordMessage } from "./discord.ts";
import { slackMessage, slackReplyThread } from "./slack.ts";

const discordAuthor = { id: "person", name: "Ada" };

describe("Discord message addresses", () => {
  it("keeps a thread under its parent and retains reply and attachment facts", () => {
    const result = discordMessage({ id: "42", author: discordAuthor, content: "See this", type: 19, timestamp: "2026-01-01T00:00:00Z",
      attachments: [{ id: "file", filename: "notes.pdf", size: 20 }], replyTo: "41" }, "bot", { id: "thread", parentId: "channel", name: "Planning", kind: "thread" });
    expect(result.conversation).toMatchObject({ conversationId: "channel", threadId: "thread" });
    expect(result.message).toMatchObject({ threadId: "thread", replyTo: "41", parts: [
      { kind: "text", text: "See this" }, { kind: "file", id: "file", filename: "notes.pdf", mediaType: "application/pdf", size: 20 },
    ], sender: { role: "participant", name: "Ada" } });
  });
  it("distinguishes service messages from the bot's own replies", () => {
    const message: DiscordMessage = { id: "42", author: discordAuthor, content: "", type: 7, timestamp: "2026-01-01T00:00:00Z", attachments: [] };
    const channel: DiscordChannel = { id: "channel", name: "General", kind: "channel" };
    expect(discordMessage(message, "bot", channel).message.sender.role).toBe("system");
    expect(discordMessage({ ...message, type: 0 }, "person", channel).message.sender.role).toBe("self");
  });
  // A direct chat must be titled by the other participant whichever side sent the observed message.
  it("titles a direct chat by its recipient and keeps threads under their parent", () => {
    const recipient = { id: "person", username: "ada", global_name: "Ada", avatar: null, discriminator: "0" };
    expect(restChannel({ id: "dm", type: 1, recipients: [recipient] })).toEqual({ id: "dm", name: "Ada", kind: "private" });
    expect(restChannel({ id: "dm", type: 1 })).toEqual({ id: "dm", name: "dm", kind: "private" });
    expect(restChannel({ id: "t", type: 11, name: "Plan", parent_id: "c" })).toEqual({ id: "t", name: "Plan", parentId: "c", kind: "thread" });
  });
});

describe("Slack message normalization", () => {
  const self = { user: "Ubot", bot: "Bbot" };
  it("uses an edited message's original identity and thread instead of the wrapper timestamp", () => {
    const value = slackMessage({ channel: "C1", ts: "1767225609.000001", subtype: "message_changed", message: {
      ts: "1767225601.000001", thread_ts: "1767225600.000001", user: "U1", text: "a &lt; b &amp; c", files: [{ id: "F1", name: "data.csv", mimetype: "text/csv" }],
    } }, self)!;
    expect(value.message).toMatchObject({ id: "1767225601.000001", threadId: "1767225600.000001", replyTo: "1767225600.000001",
      parts: [{ kind: "text", text: "a < b & c" }, { kind: "file", id: "F1", filename: "data.csv", mediaType: "text/csv" }], sender: { role: "participant" } });
    expect(value.message.sentAt).toBe("2026-01-01T00:00:01.000Z");
  });
  it("recognizes bot ID echoes without a user ID and ignores deletion envelopes", () => {
    expect(slackMessage({ channel: "C1", ts: "1767225600.000001", subtype: "bot_message", bot_id: "Bbot", text: "done" }, self)?.message.sender.role).toBe("self");
    expect(slackMessage({ channel: "C1", ts: "1767225600.000001", subtype: "message_deleted" }, self)).toBeUndefined();
  });
  it("resolves replies to a child into the root thread and refuses a conflicting Chat thread", () => {
    expect(slackReplyThread({ replyTo: "child" }, "root")).toBe("root");
    expect(slackReplyThread({ threadId: "root", replyTo: "child" }, "root")).toBe("root");
    expect(() => slackReplyThread({ threadId: "other", replyTo: "child" }, "root")).toThrow("does not belong");
  });
});

