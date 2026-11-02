import { afterEach, describe, expect, it, vi } from "vitest";
import { postWebJson } from "./http.ts";

const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

// Retain non-JSON HTTP errors and distinguish an aborted response read from malformed JSON.
describe("Web HTTP errors and cancellation", () => {
  it("retains HTTP error details and distinguishes invalid JSON on a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Upstream unavailable", { status: 503 }))
      .mockResolvedValueOnce(reply({ error: { message: "Invalid count", code: "invalid_request_error" } }, 400))
      .mockResolvedValueOnce(new Response("not JSON")));
    const request = () => postWebJson("Service", "https://provider.test/search", "test", {}, new AbortController().signal);
    await expect(request()).rejects.toMatchObject({ code: "request_failed", message: "Service request failed (HTTP 503): Upstream unavailable" });
    await expect(request()).rejects.toMatchObject({ code: "invalid_request", message: expect.stringContaining("invalid_request_error") });
    await expect(request()).rejects.toMatchObject({ code: "protocol", message: "Service returned invalid JSON." });
  });

  it("preserves cancellation during response-body consumption", async () => {
    const controller = new AbortController();
    const reason = new DOMException("Stopped", "AbortError");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => {
      const response = reply({});
      vi.spyOn(response, "text").mockImplementation(async () => { controller.abort(reason); throw reason; });
      return response;
    }));
    await expect(postWebJson("Service", "https://provider.test/search", "test", {}, controller.signal)).rejects.toBe(reason);
  });
});
