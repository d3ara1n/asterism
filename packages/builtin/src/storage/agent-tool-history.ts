import type { Json } from "@asterism-app/sdk/contracts";
import type { PluginRecordMigration, PluginStorageDeclaration, RecordMigrationEntry } from "@asterism-app/sdk/runtime";

// Persisted identities and payload fields for this step are fixed independently of runtime contracts.
const execution = "asterism.builtin/agent.execution";
const toolExecution = "asterism.builtin/agent.tool-execution";

function migrateV1ToV2(contract: string, data: Json): Json {
  const field = contract === execution ? "block" : contract === toolExecution ? "input" : null;
  if (!field || !data || typeof data !== "object" || Array.isArray(data)) return data;
  const block = data[field];
  if (!block || typeof block !== "object" || Array.isArray(block) || block.kind !== "toolcall"
    || !Object.hasOwn(block, "arguments") || !Object.hasOwn(block, "argumentsText")
    || Object.hasOwn(block, "input") || Object.hasOwn(block, "draft")) return data;
  const { arguments: value, argumentsText: text, ...rest } = block;
  if (text !== null && typeof text !== "string") return data;
  return { ...data, [field]: { ...rest,
    // Draft text (even empty) distinguishes unfinished input from a fully parsed JSON null.
    input: text !== null && value === null ? null : { kind: "structured", value },
    draft: text === null ? null : { kind: "structured", text },
  } };
}

function object(value: Json | undefined): { [key: string]: Json } | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
function v2Block({ contract, data }: RecordMigrationEntry) {
  const field = contract === execution ? "block" : contract === toolExecution ? "input" : null;
  const payload = object(data);
  const block = field ? object(payload?.[field]) : undefined;
  if (!field || !payload || !block || typeof block.responseId !== "string" || typeof block.ordinal !== "number"
    || (block.kind !== "text" && block.kind !== "thinking" && block.kind !== "toolcall")) return null;
  return { field, payload, block, responseId: block.responseId, ordinal: block.ordinal };
}

/** Version 2 has no explicit exclusions. Derive them from each original response, not the currently selected path. */
const migrateV2ToV3 = {
  groupBy: record => v2Block(record)?.responseId ?? null,
  migrate(records) {
    const blocks = records.map(v2Block);
    let lastBody = -1;
    const generated = blocks.map(entry => {
      if (!entry) return false;
      const { block, ordinal } = entry;
      const usable = typeof block.phantom === "boolean" ? !block.phantom
        : block.kind === "toolcall" ? object(block.input) !== undefined && block.draft === null : block.complete === true;
      if (usable && block.kind !== "thinking") lastBody = Math.max(lastBody, ordinal);
      return usable;
    });
    return blocks.map((entry, index) => {
      if (!entry || typeof entry.block.phantom === "boolean") return records[index]!.data;
      const { block, field, ordinal, payload } = entry;
      return { ...payload, [field]: { ...block, phantom: !generated[index] || ordinal > lastBody } };
    });
  },
} satisfies PluginRecordMigration;

export const agentToolHistoryStorage = {
  kind: "records", id: "agent-tool-history", contracts: [execution, toolExecution], version: 3,
  migrations: { 1: migrateV1ToV2, 2: migrateV2ToV3 },
} satisfies PluginStorageDeclaration;
