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
  it("applies the provider's byte limit across chunks and closes the source on rejection", async () => {
    let closed = false;
    const plugin = { files: { async *open() {
      try { yield new Uint8Array([1, 2]); yield new Uint8Array([3, 4]); }
      finally { closed = true; }
    } } };
    await expect(messagingFiles(plugin, [file], signal(), { bytes: 3, label: "the test upload limit" }))
      .rejects.toMatchObject({ code: "invalid_input", message: "File 'report.pdf' exceeds the test upload limit." });
    expect(closed).toBe(true);
  });

  it("classifies an unavailable source as invalid send input while retaining its cause", async () => {
    const cause = new MessagingError("unavailable", "Source was removed.");
    const plugin = { files: { async *open(): AsyncIterable<Uint8Array> { throw cause; } } };
    await expect(messagingFiles(plugin, [file], signal()))
      .rejects.toMatchObject({ code: "invalid_input", cause, message: expect.stringContaining("Source was removed.") });
  });
});
