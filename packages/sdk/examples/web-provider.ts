import { pluginNamespace, present, webResponseSchema } from "@asterism/sdk/contracts";
import { definePlugin, WebError, type WebProviderDefinition } from "@asterism/sdk/runtime";
import { z } from "zod";

const ns = pluginNamespace("example.web");
const Metadata = ns.data("metadata", z.object({ sourceId: z.string() }));
const responseSchema = z.object({ id: z.string(), title: z.string(), text: z.string() });
const provider: WebProviderDefinition = {
  id: "example.web/pages", label: "Example pages", search: false, fetch: true,
  urlPatterns: ["https://docs.example.test/*", "https://help.example.test/*"],
  defaultBaseUrl: "https://api.example.test", credential: { kind: "api_key", keyUrl: "https://example.test/api-keys" },
  create({ baseUrl, credential }) {
    return { async fetch(request, { signal }) {
      const response = await fetch(new URL("/read", baseUrl), {
        method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}` },
        body: JSON.stringify({ url: request.url }),
      });
      if (!response.ok) throw new WebError("request_failed", `Page service returned HTTP ${response.status}.`);
      const page = responseSchema.parse(await response.json());
      return webResponseSchema.parse({ documents: [{ url: request.url, title: page.title,
        content: [{ kind: "body", format: "markdown", text: page.text }], details: [present(Metadata, { sourceId: page.id })] }],
        hints: request.query ? [{ code: "unsupported_parameter", parameter: "query", message: "This provider returned the page without query-focused excerpts." }] : [],
      });
    } };
  },
};
export default definePlugin({ namespace: ns, version: "1.0.0", setup: () => ({ webProviders: [provider] }) });
