import { describe, expect, it } from "vitest";
import { MessagingError } from "@asterism-app/sdk/runtime";
import { messagingFailure, prepareSend } from "./outcome.ts";

describe("Messaging tool outcomes", () => {
  it("reports a preparation failure as unsent without changing its transient classification", async () => {
    const failure = new MessagingError("request_failed", "Metadata lookup failed.");
    const prepared = await prepareSend(new AbortController().signal, async () => { throw failure; }).catch(error => error);
    expect(prepared.cause).toBe(failure);
    expect(messagingFailure(prepared, "write", false))
      .toEqual({ kind: "failed", error: { code: "request_failed", message: "Metadata lookup failed." } });
    expect(messagingFailure(failure, "write", false)).toMatchObject({ kind: "unknown" });
  });

  // A send that may have reached the platform must not be reported as a plain failure, or the model would resend it.
  it("fails writes only when nothing was sent and reports other write failures as unknown with their cause", () => {
    expect(messagingFailure(new MessagingError("invalid_input", "File 'a.png' could not be read."), "write", false))
      .toEqual({ kind: "failed", error: { code: "invalid_input", message: "File 'a.png' could not be read." } });
    expect(messagingFailure(new MessagingError("request_failed", "Too Many Requests", { retryAfterMs: 3000 }), "write", false))
      .toMatchObject({ kind: "failed", error: { code: "request_failed" } });
    expect(messagingFailure(new MessagingError("request_failed", "socket hang up"), "write", false))
      .toEqual({ kind: "unknown", message: "The message may have been sent: socket hang up" });
    expect(messagingFailure(new TypeError("boom"), "write", false)).toMatchObject({ kind: "unknown" });
  });
  it("keeps the code and cause of read failures and reports cancellation", () => {
    expect(messagingFailure(new MessagingError("invalid_cursor", "Stale cursor."), "read", false))
      .toEqual({ kind: "failed", error: { code: "invalid_cursor", message: "Stale cursor." } });
    expect(messagingFailure(new TypeError("boom"), "read", false)).toMatchObject({ kind: "failed", error: { code: "request_failed", message: "boom" } });
    expect(messagingFailure(new Error("aborted"), "write", true)).toMatchObject({ kind: "cancelled" });
  });
});
