import { describe, expect, it } from "vitest";
import { MessagingError } from "@asterism-app/sdk/runtime";
import type { FileReferencePart } from "@asterism-app/sdk/contracts";
import { messagingFiles } from "./provider-shared.ts";

const file: FileReferencePart = {
  kind: "file-reference", filename: "report.pdf", mediaType: "application/pdf",
  ref: { source: { sessionId: "session", id: "source", kind: "test.file" }, locator: { id: "report" } },
};
const signal = () => new AbortController().signal;

describe("Messaging attachment preparation", () => {
  it("classifies an unavailable source as invalid send input while retaining its cause", async () => {
    const cause = new MessagingError("unavailable", "Source was removed.");
    const plugin = { files: { async *open(): AsyncIterable<Uint8Array> { throw cause; } } };
    await expect(messagingFiles(plugin, [file], signal()))
      .rejects.toMatchObject({ code: "invalid_input", cause, message: expect.stringContaining("Source was removed.") });
  });
});
