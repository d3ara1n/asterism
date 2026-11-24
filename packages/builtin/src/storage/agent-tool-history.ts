import type { Json } from "@asterism-app/sdk/contracts";
import type { PluginStorageDeclaration } from "@asterism-app/sdk/runtime";

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

export const agentToolHistoryStorage = {
  kind: "records", id: "agent-tool-history", contracts: [execution, toolExecution], version: 2,
  migrations: { 1: migrateV1ToV2 },
} satisfies PluginStorageDeclaration;
