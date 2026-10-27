import { z } from "zod";
import { belongsTo, jsonSchema, type CreationContract, type Json, type SessionDirectory } from "@asterism/sdk/contracts";
import { defineModule, PluginApiError, type PluginContext, type PluginModule, type ObjectReader, type TopLevelToolContext } from "@asterism/sdk/runtime";

export interface AgentCreationDescription {
  readonly id: string;
  readonly resourceKind: string;
  readonly description: string;
  readonly guidelines: readonly string[];
  readonly input: Json;
}
interface Entry {
  readonly description: AgentCreationDescription;
  create(input: Json, context: TopLevelToolContext): ReturnType<TopLevelToolContext["session"]["create"]>;
}
type CreationOptions = Parameters<TopLevelToolContext["session"]["create"]>[2];
/** Catalogs are isolated by host runtime instance; shared public exports do not mix plugin registrations from different hosts. */
const directories = new WeakMap<SessionDirectory, Map<string, Entry>>();
function directory(plugin: PluginContext): Map<string, Entry> {
  plugin.lifetime.signal.throwIfAborted();
  let entries = directories.get(plugin.sessions);
  if (!entries) { entries = new Map(); directories.set(plugin.sessions, entries); }
  return entries;
}
function entry(plugin: PluginContext, id: string): Entry {
  const value = directory(plugin).get(id);
  if (!value) throw new PluginApiError("not_found", "This Agent creation entry is unavailable. Read creation_list for available entries.");
  return value;
}

/** The domain service shared by built-in creation tools and plugins; querying is not a prerequisite for creation. */
export const agentCreations = {
  list(plugin: PluginContext) {
    return [...directory(plugin).values()].map(({ description: { id, resourceKind, description } }) => ({ id, resourceKind, description }));
  },
  inspect(plugin: PluginContext, id: string): AgentCreationDescription { return structuredClone(entry(plugin, id).description); },
  create(plugin: PluginContext, id: string, input: Json, context: TopLevelToolContext) {
    return entry(plugin, id).create(input, context);
  },
};

/** Agent creation entry points are independent domain contributions; they reuse creation input directly or explicitly adapt model input. */
export function defineAgentCreation<I, S extends Json, O extends Json, A extends Json = Json>(definition: {
  id: string;
  description: string;
  guidelines?: readonly string[];
  creation: CreationContract<I, S, O>;
} & ({ inputSchema?: never; toInput?: never; toOptions?: never } | {
  inputSchema: z.ZodType<A>;
  toInput(input: A, context: { object: ObjectReader }): I & Json;
  toOptions?(input: A, context: { object: ObjectReader }): CreationOptions;
})): PluginModule {
  return defineModule(plugin => {
    if (!belongsTo(plugin.id, definition.id)) throw new PluginApiError("invalid_argument", "The Agent creation entry belongs to another plugin.");
    if (!definition.description.trim()) throw new PluginApiError("invalid_argument", "An Agent creation entry needs a description.");
    const entries = directory(plugin);
    if (entries.has(definition.id)) throw new PluginApiError("conflict", `Duplicate Agent creation entry: ${definition.id}`);
    const input = jsonSchema.parse(z.toJSONSchema(definition.inputSchema ?? definition.creation.schema, { io: "input" }));
    const value: Entry = {
      description: { id: definition.id, resourceKind: definition.creation.resource.kind,
        description: definition.description, guidelines: [...definition.guidelines ?? []], input },
      create(raw, context) {
        plugin.lifetime.signal.throwIfAborted(); context.signal.throwIfAborted();
        let converted: I & Json;
        let options: CreationOptions;
        if (definition.inputSchema) {
          const parsed = definition.inputSchema.safeParse(raw);
          if (!parsed.success) throw new PluginApiError("invalid_argument", parsed.error.message);
          converted = jsonSchema.parse(definition.toInput(parsed.data, { object: context.object })) as I & Json;
          options = definition.toOptions?.(parsed.data, { object: context.object });
        } else converted = raw as I & Json;
        return context.session.create(definition.creation, converted, options);
      },
    };
    entries.set(definition.id, value);
    // Remove registrations as soon as the plugin aborts: a plugin whose assembly failed must not remain publicly queryable during asynchronous cleanup.
    plugin.lifetime.signal.addEventListener("abort", () => { if (entries.get(definition.id) === value) entries.delete(definition.id); }, { once: true });
    return {};
  });
}
