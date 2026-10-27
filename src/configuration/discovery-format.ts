import { z } from "zod";
import { discoveredModelSchema, thinkingSchema, type DiscoveredModel } from "../shared/configuration.ts";

const support = z.object({ supported: z.boolean() });
const identity = z.object({ id: discoveredModelSchema.shape.modelId });
const anthropicModelEntry = identity.extend({
  display_name: discoveredModelSchema.shape.name.optional(),
  max_input_tokens: z.number().int().positive().nullish(),
  capabilities: z.object({
    thinking: z.object({ supported: z.boolean(), types: z.object({ disabled: support.optional() }).optional() }).optional(),
    effort: z.record(z.string(), z.unknown()).optional(),
  }).nullish(),
});
const codexModelEntry = z.object({
  slug: discoveredModelSchema.shape.modelId,
  display_name: discoveredModelSchema.shape.name.optional(),
});
const pageSchema = z.object({
  data: z.array(z.unknown()).optional(),
  models: z.array(z.unknown()).optional(),
  has_more: z.boolean().optional(),
  last_id: z.string().nullish(),
}).refine(page => (page.data !== undefined) !== (page.models !== undefined), "Expected exactly one model list.");

export interface ModelListPage {
  models: DiscoveredModel[];
  hasMore: boolean;
  lastId: string | null;
}

function hasAnthropicMetadata(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  if (("type" in raw && raw.type === "model") || "display_name" in raw || "max_input_tokens" in raw) return true;
  if (!("capabilities" in raw)) return false;
  const capabilities = raw.capabilities;
  return typeof capabilities === "object" && capabilities !== null && ("thinking" in capabilities || "effort" in capabilities);
}

function parseDataModel(raw: unknown): DiscoveredModel {
  const { id } = identity.parse(raw);
  const model: DiscoveredModel = { modelId: id, name: id };
  if (!hasAnthropicMetadata(raw)) return model;
  // Fail on corrupt recognized metadata rather than silently losing capabilities by falling back to IDs only.
  const entry = anthropicModelEntry.parse(raw);
  model.name = entry.display_name ?? entry.id;
  if (entry.max_input_tokens != null) model.contextWindow = entry.max_input_tokens;
  const thinking = entry.capabilities?.thinking;
  if (thinking) model.reasoning = thinking.supported;
  const effort = entry.capabilities?.effort;
  if (effort) model.thinkingLevels = thinkingSchema.options.filter(level => level === "off"
    ? thinking?.types?.disabled?.supported === true
    : support.safeParse(effort[level]).data?.supported === true);
  return model;
}

function parseCodexModel(raw: unknown): DiscoveredModel {
  const entry = codexModelEntry.parse(raw);
  return { modelId: entry.slug, name: entry.display_name ?? entry.slug };
}

/** Identify catalog formats solely by response structure; message protocol and vendor identity do not affect parsing. */
export function parseModelListPage(raw: unknown): ModelListPage {
  const page = pageSchema.parse(raw);
  return {
    models: page.data !== undefined ? page.data.map(parseDataModel) : page.models!.map(parseCodexModel),
    hasMore: page.has_more ?? false,
    lastId: page.last_id ?? null,
  };
}
