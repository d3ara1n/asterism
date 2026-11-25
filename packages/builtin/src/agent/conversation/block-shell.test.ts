import { expect, it } from "vitest";
import { blockLine } from "./block-shell";

const block = { id: "r:0", responseId: "r", ordinal: 0 };

it("leaves streaming text and thinking unoutlined", () => {
  expect(blockLine({ ...block, kind: "text", text: "Reply", endedAt: null })).toBeUndefined();
  expect(blockLine({ ...block, kind: "thinking", text: "Reasoning", startedAt: 0, endedAt: null })).toBeUndefined();
});

it("animates a tool outline while its input is forming or ready, not while it executes", () => {
  const tool = { ...block, kind: "toolcall" as const, name: "example", invocation: null, result: null };
  const ready = { ...tool, draft: null, input: { kind: "structured" as const, value: {} } };
  expect(blockLine({ ...tool, state: "input", input: null, draft: { kind: "structured", text: "{" } })).toBe("forming");
  expect(blockLine({ ...ready, state: "ready" })).toBe("forming");
  expect(blockLine({ ...ready, state: "executing" })).toBeUndefined();
});

it("keeps the unfinished and error outlines without treating phantom itself as a visual state", () => {
  const saved = { ...block, kind: "text" as const, text: "Reply", createdAt: "2026-01-01", phantom: true };
  expect(blockLine({ ...saved, complete: false })).toBe("incomplete");
  expect(blockLine({ ...saved, complete: false, generationFailed: true })).toBe("generation-error");
  expect(blockLine({ ...saved, complete: true })).toBeUndefined();
});
