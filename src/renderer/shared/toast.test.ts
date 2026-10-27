import { expect, it, vi } from "vitest";
import { operationSucceeded, toast } from "./toast";

// Workbench feedback ownership: the initiating entry consumes each operation failure, repeated failures produce separate notices, and success creates no error notification.
it("operation receipts directly produce transient notices, and repeated errors need no shared state or clearing step", () => {
  const notify = vi.spyOn(toast, "error").mockReturnValue("notification");
  try {
    expect(operationSucceeded({ ok: true })).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    const failure = { ok: false as const, error: { code: "model_unavailable", message: "Model unavailable.", display: "Choose an available model." } };
    expect(operationSucceeded(failure)).toBe(false);
    expect(operationSucceeded(failure)).toBe(false);
    expect(notify.mock.calls).toEqual([["Choose an available model."], ["Choose an available model."]]);
  } finally { notify.mockRestore(); }
});
