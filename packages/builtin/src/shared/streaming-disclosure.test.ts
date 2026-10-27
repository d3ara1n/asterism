import { describe, expect, it } from "vitest";
import { advanceStreamingDisclosure as advance, changeStreamingDisclosure as change, initialStreamingDisclosure as initial } from "./streaming-disclosure.ts";

const preferences = { autoExpand: true, autoCollapse: true };

// Workbench contract: wait one second after the first body text, cancel the wait when the stage ends, and prioritize manual choices; verify state transitions with explicit values.
describe("shared streaming preview disclosure", () => {
  it("does not start timing during an empty stage, retains the first body-text start across deltas, and expands only after one second", () => {
    const empty = advance(initial(), "input", false, preferences, 0);
    expect(advance(empty, "input", false, preferences, 3000).open).toBe(false);
    const content = advance(empty, "input", true, preferences, 3000);
    const increment = advance(content, "input", true, preferences, 3999);
    expect(increment.open).toBe(false);
    expect(advance(increment, "input", true, preferences, 4000).open).toBe(true);
  });

  it("cancels the wait when a short stream ends and keeps history and late refreshes collapsed", () => {
    const pending = advance(initial(), "thinking", true, preferences, 0);
    const ended = advance(pending, null, false, preferences, 999);
    expect(ended).toMatchObject({ open: false, expandAt: null });
    expect(advance(ended, null, false, preferences, 1000).open).toBe(false);
    expect(advance(initial(), null, true, preferences, 5000).open).toBe(false);
  });

  it("waits independently for input and execution output, retaining the same stage for subsequent execution activity", () => {
    const input = advance(initial(), "input", true, preferences, 0);
    const output = advance(input, "output", false, preferences, 500);
    const writing = advance(output, "output", true, preferences, 2000);
    expect(advance(writing, "output", true, preferences, 2500).open).toBe(false);
    const activity = advance(writing, "output", false, preferences, 2800);
    expect(advance(activity, "output", true, preferences, 3000).open).toBe(true);
  });

  it("does not reopen on later deltas or expiry refreshes after manually opening and closing during the wait", () => {
    const pending = advance(initial(), "thinking", true, preferences, 0);
    const opened = change(pending, true);
    expect(opened).toMatchObject({ open: true, expandAt: null });
    const closed = change(opened, false);
    expect(advance(closed, "thinking", true, preferences, 2000).open).toBe(false);
    // A tool body component may exist before its content; manual choices still take precedence then.
    const empty = advance(initial(), "input", false, preferences, 0);
    const manual = change(change(empty, true), false);
    const content = advance(manual, "input", true, preferences, 100);
    expect(advance(content, "input", true, preferences, 2000).open).toBe(false);
  });

  it("disabling automatic expansion cancels the wait, and reenabling the preference does not retrigger it in the same stage", () => {
    const disabled = { ...preferences, autoExpand: false };
    const pending = advance(initial(), "output", true, preferences, 0);
    const cancelled = advance(pending, "output", true, disabled, 500);
    expect(cancelled.expandAt).toBeNull();
    expect(advance(cancelled, "output", true, preferences, 2000).open).toBe(false);
    const initiallyDisabled = advance(initial(), "input", true, disabled, 0);
    expect(advance(initiallyDisabled, "input", true, preferences, 2000).open).toBe(false);
  });

  it("collapses only once at completion and preserves the current state when automatic collapse is disabled", () => {
    const pending = advance(initial(), "output", true, preferences, 0);
    const open = advance(pending, "output", true, preferences, 1000);
    const ended = advance(open, null, false, preferences, 2000);
    expect(ended.open).toBe(false);
    const reopened = change(ended, true);
    expect(advance(reopened, null, false, preferences, 3000).open).toBe(true);
    expect(advance(open, null, false, { ...preferences, autoCollapse: false }, 2000).open).toBe(true);
    expect(advance(pending, null, false, { ...preferences, autoCollapse: false }, 500).open).toBe(false);
  });

  it("tools without streaming preview retain manual disclosure state, and stage changes do not trigger automatic collapse", () => {
    const input = advance(initial(), "input", false, preferences, 0);
    const opened = change(input, true);
    const executing = advance(opened, "output", false, preferences, 2000);
    expect(executing.open).toBe(true);
    expect(advance(executing, null, false, preferences, 3000).open).toBe(true);
  });

  it("immediately expands content requiring action once, regardless of preferences or earlier manual collapse", () => {
    const off = { autoExpand: false, autoCollapse: true };
    const closed = change(advance(initial(), "output", false, off, 0), false);
    const attention = advance(closed, "output", false, off, 10, true);
    expect(attention).toMatchObject({ open: true, expandAt: null });
    // If the user subsequently collapses it, a persistent action-required state in the same stage does not reopen it.
    expect(advance(change(attention, false), "output", false, off, 20, true).open).toBe(false);
  });

  it("preserves disclosure state when the action-required stage ends and presents the result in place", () => {
    const attention = advance(initial(), "output", true, preferences, 0, true);
    expect(advance(attention, null, false, preferences, 5000).open).toBe(true);
    // Recalculate for a new stage; markers from an old stage do not block the next expansion.
    const next = advance(change(advance(attention, null, false, preferences, 5000), false), "output", false, preferences, 6000, true);
    expect(next.open).toBe(true);
  });
});
