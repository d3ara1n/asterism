import { describe, expect, it } from "vitest";
import type { WebFetchResult } from "@asterism-app/sdk/contracts";
import { WebError } from "@asterism-app/sdk/runtime";
import { webToModel, webToolError } from "./projection.ts";

describe("Web model results", () => {
  it("keeps source attribution, provider-supplied sections and truncation without returning execution diagnostics", () => {
    const url = "https://source.test/article";
    const data: WebFetchResult = {
      requestedUrl: url, provider: "example-provider", requestId: "request-identifier",
      usage: [{ name: "extract", amount: 2, unit: "credits" }],
      details: [{ contract: { id: "response-diagnostics" }, data: "private response trace" }],
      documents: [{ url, title: "Article", author: "Its author", dates: [{ kind: "published", value: "2026-01-01" }], score: 0.88,
        details: [{ contract: { id: "source-diagnostics" }, data: "private document trace" }],
        content: [{ kind: "body", format: "markdown", text: "same content", truncated: true },
          { kind: "summary", format: "text", text: "same content" }],
      }],
      hints: [{ code: "provider_failed", message: "Provider fallback trace" },
        { code: "unsupported_parameter", parameter: "query", message: "A provider-specific diagnostic" }],
    };
    expect(JSON.parse(webToModel(data))).toEqual({
      documents: [{ url, title: "Article", author: "Its author", dates: [{ kind: "published", value: "2026-01-01" }],
        content: [{ kind: "body", format: "markdown", text: "same content", truncated: true },
          { kind: "summary", format: "text", text: "same content" }],
      }],
      hints: ['The requested parameter "query" was not applied.'],
    });
  });

  it("keeps a source HTTP status without confusing provider API failures with page failures", () => {
    const pageMissing = webToolError(new WebError("request_failed", "Private attempt log", 404), "fetch");
    expect(pageMissing.message).toBe("The requested page returned HTTP 404.");
    const upstream = webToolError(new WebError("request_failed", "Provider API returned HTTP 404"), "fetch");
    expect(upstream.message).not.toMatch(/404|provider/i);
  });
});
