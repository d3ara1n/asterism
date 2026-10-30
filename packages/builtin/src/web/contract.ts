import { z } from "zod";
import { defineCreation, defineImplementation, defineTool, webSearchRequestSchema, webFetchRequestSchema,
  webSearchResultSchema, webFetchResultSchema } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const WebResource = builtin.resource("web", z.object({}));
export const CreateWeb = defineCreation(WebResource, { id: builtin.name("web.create"), schema: z.object({ title: z.string().trim().min(1).default("Web") }) });
const countsSchema = z.object({ succeeded: z.number(), failed: z.number(), cancelled: z.number() });
const costSchema = z.object({ currency: z.string(), amount: z.number() });
/** Card projection: whether any provider is enabled, and request statistics for its session during this run (backend memory only, not resource data). */
export const WebView = builtin.data("web.card", z.object({
  configured: z.boolean(),
  stats: z.object({
    search: countsSchema, fetch: countsSchema, inFlight: z.number(),
    averageMs: z.number().nullable(), lastMs: z.number().nullable(), cost: z.array(costSchema),
    recent: z.array(z.object({ kind: z.enum(["search", "fetch"]), subject: z.string(), outcome: z.enum(["succeeded", "failed", "cancelled"]),
      at: z.number(), durationMs: z.number(), cost: z.array(costSchema) })),
  }),
}));
export type WebCardData = z.infer<typeof WebView.schema>;
const targetSchema = z.null().describe("Select the Web resource.");
export const WebSearch = defineImplementation({
  ...builtin.data("web.search", webSearchResultSchema.describe("Search sources, typed details, actual provider, usage and execution hints.")),
  resource: WebResource, targetSchema, effect: "read", execution: "parallel",
  tool: defineTool({ id: builtin.name("web.tool.search"), name: "web_search",
    description: "Search the web for sources matching a query.",
    guidelines: ["Results include source URLs, content, structured details and hints describing any conditions that were not applied."],
    argsSchema: webSearchRequestSchema,
  }),
});
export const WebFetch = defineImplementation({
  ...builtin.data("web.fetch", webFetchResultSchema.describe("Retrieved documents, typed details, actual provider, usage and execution hints.")),
  resource: WebResource, targetSchema, effect: "read", execution: "parallel",
  tool: defineTool({ id: builtin.name("web.tool.fetch"), name: "web_fetch",
    description: "Retrieve readable content and structured information for a URL.",
    guidelines: [],
    argsSchema: webFetchRequestSchema,
  }),
});
