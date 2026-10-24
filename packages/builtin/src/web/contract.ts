import { z } from "zod";
import { defineCreation, defineImplementation, defineTool, webSearchRequestSchema, webFetchRequestSchema,
  webSearchResultSchema, webFetchResultSchema, webProviderConnectionSchema, webProviderTypeSchema } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

export const WebResource = builtin.resource("web", z.object({}));
export const CreateWeb = defineCreation(WebResource, { id: builtin.name("web.create"), schema: z.object({ title: z.string().trim().min(1).default("Web") }) });
export const WebView = builtin.data("web.card", z.object({
  connections: z.array(webProviderConnectionSchema.omit({ settings: true, baseUrl: true, auth: true })),
  types: z.array(webProviderTypeSchema.pick({ id: true, label: true, search: true, fetch: true, urlPatterns: true })),
}));
const targetSchema = z.null().describe("The Web resource provides access to the configured web connections.");
export const WebSearch = defineImplementation({
  ...builtin.data("web.search", webSearchResultSchema.describe("Search sources, typed details, actual provider, usage and execution hints.")),
  resource: WebResource, targetSchema, effect: "read", execution: "parallel",
  tool: defineTool({ id: builtin.name("web.tool.search"), name: "web_search",
    description: "Search the web using a configured provider. Results include source URLs, content, structured details and hints describing any conditions that were not applied.",
    guidelines: ["resource_inspect lists the available web connections. The first enabled search connection is the default."],
    argsSchema: webSearchRequestSchema.extend({ provider: z.string().min(1).optional().describe("Optional connection ID from resource_inspect; defaults to the first enabled search connection.") })
      .describe("Search query, optional filters and optional provider connection."),
  }),
});
export const WebFetch = defineImplementation({
  ...builtin.data("web.fetch", webFetchResultSchema.describe("Retrieved documents, typed details, actual provider, usage and execution hints.")),
  resource: WebResource, targetSchema, effect: "read", execution: "parallel",
  tool: defineTool({ id: builtin.name("web.tool.fetch"), name: "web_fetch",
    description: "Retrieve readable content and structured information for a URL. The first matching enabled provider handles the URL, using connection order and its declared URL patterns.",
    guidelines: [], argsSchema: webFetchRequestSchema,
  }),
});
