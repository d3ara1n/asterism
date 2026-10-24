import { z } from "zod";
import { defineCreation, defineImplementation, defineTool, webSearchRequestSchema, webFetchRequestSchema,
  webSearchResultSchema, webFetchResultSchema, webProviderTypeSchema } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

export const WebResource = builtin.resource("web", z.object({}));
export const CreateWeb = defineCreation(WebResource, { id: builtin.name("web.create"), schema: z.object({ title: z.string().trim().min(1).default("Web") }) });
export const WebView = builtin.data("web.card", z.object({
  types: z.array(webProviderTypeSchema.pick({ id: true, label: true, search: true, fetch: true }).extend({ enabled: z.boolean() })),
}));
const targetSchema = z.null().describe("The Web resource provides access to all configured web providers.");
export const WebSearch = defineImplementation({
  ...builtin.data("web.search", webSearchResultSchema.describe("Search sources, typed details, actual provider, usage and execution hints.")),
  resource: WebResource, targetSchema, effect: "read", execution: "parallel",
  tool: defineTool({ id: builtin.name("web.tool.search"), name: "web_search",
    description: "Search the web using the first enabled provider. Results include source URLs, content, structured details and hints describing any conditions that were not applied.",
    guidelines: ["resource_inspect lists the available web providers and their search and fetch capabilities."],
    argsSchema: webSearchRequestSchema,
  }),
});
export const WebFetch = defineImplementation({
  ...builtin.data("web.fetch", webFetchResultSchema.describe("Retrieved documents, typed details, actual provider, usage and execution hints.")),
  resource: WebResource, targetSchema, effect: "read", execution: "parallel",
  tool: defineTool({ id: builtin.name("web.tool.fetch"), name: "web_fetch",
    description: "Retrieve readable content and structured information for a URL. Providers are matched by their declared URL patterns in configuration order.",
    guidelines: ["resource_inspect lists the available web providers and which URL patterns each provider handles."],
    argsSchema: webFetchRequestSchema,
  }),
});
