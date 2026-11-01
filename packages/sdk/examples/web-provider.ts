import { pluginNamespace, present, webResponseSchema } from "@asterism-app/sdk/contracts";
import { definePlugin, WebError, type WebProviderDefinition } from "@asterism-app/sdk/runtime";
import { z } from "zod";

const ns = pluginNamespace("example.web");
const Metadata = ns.data("metadata", z.object({ sourceId: z.string() }));
const responseSchema = z.object({ id: z.string(), title: z.string(), text: z.string() });
const BASE_URL = "https://api.example.test";
const provider: WebProviderDefinition = {
  id: "example.web/pages", label: "Example pages", search: false, fetch: true,
  urlPatterns: ["https://docs.example.test/*", "https://help.example.test/*"],
  settings: [
    { kind: "secret", key: "apiKey", label: "API key", required: true, helpUrl: "https://example.test/api-keys" },
    { kind: "choice", key: "format", label: "Page format", default: "markdown", options: [
      { value: "markdown", label: "Markdown" }, { value: "text", label: "Plain text" },
    ] },
  ],
  create({ settings }) {
    // Required secrets are present and choices hold a declared option.
    const format = settings.format as "markdown" | "text";
    return { async fetch(request, { signal }) {
      const response = await fetch(new URL("/read", BASE_URL), {
        method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ url: request.url, format }),
      });
      if (!response.ok) throw new WebError("request_failed", `Page service returned HTTP ${response.status}.`);
      const page = responseSchema.parse(await response.json());
      return webResponseSchema.parse({ documents: [{ url: request.url, title: page.title,
        content: [{ kind: "body", format, text: page.text }], details: [present(Metadata, { sourceId: page.id })] }],
        hints: request.query ? [{ code: "unsupported_parameter", parameter: "query", message: "This provider returned the page without query-focused excerpts." }] : [],
      });
    } };
  },
};
export default definePlugin({ namespace: ns, setup: () => ({ webProviders: [provider] }) });
