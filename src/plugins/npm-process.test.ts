import { expect, test } from "vitest";
import { redactNpmOutput } from "./npm-process.ts";

test("package-manager diagnostics redact registry authentication while retaining actionable locations", () => {
  expect(redactNpmOutput("Fetch https://user:secret@registry.example/package?access_token=private&version=1.0.0 failed\n_authToken=hidden\nAuthorization: Bearer abc123\npassword: value\n"))
    .toBe("Fetch https://[redacted]@registry.example/package?access_token=[redacted]&version=1.0.0 failed\n_authToken=[redacted]\nAuthorization: [redacted]\npassword: [redacted]\n");
});
