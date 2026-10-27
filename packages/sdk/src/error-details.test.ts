import { expect, it } from "vitest";
import { describeError } from "./error-details.ts";

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
