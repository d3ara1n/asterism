import { describe, expect, it, vi } from "vitest";
import type { PeekClient, PeekInput, PeekOutcome, PeekResult } from "@asterism-app/builtin-api/contracts";
import { createPeekConversation } from "./conversation.ts";

const report = (text: string): PeekResult => ({
  snapshot: { nodeId: "saved", capturedAt: "2026-11-05T00:00:00Z", records: 1 },
  phase: "writing", report: text, round: 1, requests: [], queries: [],
});
const client = (run: PeekClient["run"]): PeekClient => ({ run, stream: vi.fn() });

describe("Temporary Peek conversation", () => {
  it("Accumulates questions and final reports across follow-ups without carrying provisional reports or sharing history between panels", async () => {
    const conversation = createPeekConversation(), inputs: PeekInput[] = [];
    const peek = client(async (input, options) => {
      inputs.push(input);
      options.onProgress?.(report("Provisional explanation"));
      return { kind: "succeeded", data: report(`Answer ${inputs.length}`) };
    });
    await conversation.submit(peek, "Explain this");
    await conversation.submit(peek, "Why?");
    await conversation.submit(peek, "And the alternative?");
    expect(inputs[2].history).toEqual([
      { question: "Explain this", report: "Answer 1", outcome: "succeeded" },
      { question: "Why?", report: "Answer 2", outcome: "succeeded" },
    ]);
    await createPeekConversation().submit(peek, "Explain another conversation");
    expect(inputs[3].history).toEqual([]);
  });

  it("Prevents reentry, preserves the next draft, and carries cancelled text as incomplete follow-up context", async () => {
    const conversation = createPeekConversation();
    const peek = client((_input, { signal, onProgress }) => new Promise<PeekOutcome>((_resolve, reject) => {
      onProgress?.(report("Already visible"));
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const first = conversation.submit(peek, "Explain");
    conversation.setDraft("Next question");
    expect(await conversation.submit(peek, "Duplicate")).toBe(false);
    conversation.stop();
    await first;
    expect(conversation.getSnapshot()).toMatchObject({
      pending: false, draft: "Next question", turns: [{ result: { kind: "cancelled", data: { report: "Already visible" } } }],
    });
    const next = client(async input => {
      expect(input.history).toEqual([{ question: "Explain", report: "Already visible", outcome: "cancelled" }]);
      return { kind: "succeeded", data: report("Continued explanation") };
    });
    await conversation.submit(next, conversation.getSnapshot().draft);
    expect(conversation.getSnapshot().turns).toHaveLength(2);
  });
});
