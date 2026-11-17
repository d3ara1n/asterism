import { expect, it } from "vitest";
import { z } from "zod";
import { describeError, errorMessage } from "./error-details.ts";

// SDK exceptions put request parameters and responses in the same object; save only error and response data in diagnostics.
it("error details preserve raw responses and cause chains while excluding request fields and credential response headers", () => {
  const cause = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  const error = Object.assign(new Error("upstream failure", { cause }), {
    statusCode: 502, responseBody: "<html>Bad Gateway</html>",
    responseHeaders: { "x-request-id": "req-1", "set-cookie": "private-cookie", Authorization: "private-token" },
    requestBodyValues: { messages: ["private-prompt"] }, requestHeaders: { authorization: "private-key" },
  });
  const details = describeError(error);
  expect(details).toMatchObject({
    message: "upstream failure", statusCode: 502, responseBody: "<html>Bad Gateway</html>",
    responseHeaders: { "x-request-id": "req-1" },
    causes: [{ message: "connect ECONNREFUSED", code: "ECONNREFUSED" }],
  });
  expect(JSON.stringify(details)).not.toContain("private-");
  expect(JSON.stringify(describeError({ ...error, message: error.message }))).not.toContain("private-");
});

// Streaming errors may be ordinary JSON; preserve unknown server fields instead of extracting only a message.
it("ordinary server error data and existing diagnostics retain their original text through subsequent wrapping", () => {
  const original = { type: "error", error: { code: "overloaded", message: "Try later", retry_after: 5 } };
  const details = describeError(original);
  expect(details.data).toBe(JSON.stringify(original));
  expect(describeError(Object.assign(new Error("wrapper"), { details }))).toEqual(details);
});

// A missing message must not promote the complete server object into the summary.
it("missing and empty messages use the caller's summary while diagnostics preserve server data", () => {
  const raw = { type: "error", error: { code: "overloaded", retry_after: 5 } };
  expect(errorMessage(raw, "Provider request failed.")).toBe("Provider request failed.");
  expect(describeError(raw).data).toBe(JSON.stringify(raw));
  expect(errorMessage(new Error("  "), "Agent execution failed.")).toBe("Agent execution failed.");
  expect(errorMessage("", "Agent execution failed.")).toBe("Agent execution failed.");
  expect(errorMessage({ message: 400 }, "Provider request failed.")).toBe("Provider request failed.");
  expect(errorMessage({ message: "Upstream overloaded", data: raw }, "Provider request failed.")).toBe("Upstream overloaded");
  expect(errorMessage("Connection refused", "Provider request failed.")).toBe("Connection refused");
});

// Zod's message is a serialized issue tree, not the summary consumed by notices and diagnostics.
it("validation errors separate the failure summary from the original issue tree", () => {
  const parsed = z.object({ count: z.number() }).safeParse({ count: "invalid" });
  if (parsed.success) throw new Error("Expected validation to fail.");
  expect(errorMessage(parsed.error, "Agent execution failed.")).toBe("Validation failed.");
  expect(describeError(parsed.error).message).toBe(parsed.error.message);
  expect(JSON.parse(describeError(parsed.error).message)).toEqual([
    expect.objectContaining({ code: "invalid_type", path: ["count"], expected: "number" }),
  ]);
});
