import { describe, expect, it } from "vitest";
import { WebAPIPlatformError, WebAPIRateLimitedError } from "@slack/web-api";
import { slackError } from "./slack.ts";
import { definitelyNotSent } from "./outcome.ts";

describe("Slack SDK errors", () => {
  it("distinguishes refusals from ambiguous server failures and preserves rate-limit delays", () => {
    const denied = slackError(new WebAPIPlatformError({ ok: false, error: "missing_scope" }));
    const failed = slackError(new WebAPIPlatformError({ ok: false, error: "internal_error" }));
    const limited = slackError(new WebAPIRateLimitedError(7));
    expect(definitelyNotSent(denied)).toBe(true);
    expect(definitelyNotSent(failed)).toBe(false);
    expect(limited).toMatchObject({ code: "request_failed", retryAfterMs: 7000 });
    expect(definitelyNotSent(limited)).toBe(true);
  });
});
