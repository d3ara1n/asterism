import type { DatabaseSync } from "node:sqlite";
import { resolveProviderModel, type ConfigurationSnapshot } from "../shared/configuration.ts";
import { conversationSelectionSchema, type ConversationSelection } from "../shared/conversation.ts";
import { ConversationError } from "../conversation/store.ts";

/** 会话当前选择：可修改设置，不进入追加历史。 */
export class SelectionRepository {
  constructor(private readonly db: DatabaseSync) {}
  get(taskId: string, agentId: string): { selection: ConversationSelection; revision: number } | null {
    const row = this.db.prepare(`SELECT agent_configuration_id AS agentConfigurationId, model_id AS modelId, thinking, revision
      FROM conversation_selections WHERE task_id = ? AND agent_id = ?`).get(taskId, agentId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const { revision, ...selection } = row;
    return { selection: conversationSelectionSchema.parse(selection), revision: Number(revision) };
  }
  save(taskId: string, agentId: string, selection: ConversationSelection): void {
    this.db.prepare(`INSERT INTO conversation_selections (task_id, agent_id, agent_configuration_id, model_id, thinking)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(task_id, agent_id) DO UPDATE SET
      agent_configuration_id = excluded.agent_configuration_id, model_id = excluded.model_id, thinking = excluded.thinking,
      revision = conversation_selections.revision + 1`)
      .run(taskId, agentId, selection.agentConfigurationId, selection.modelId, selection.thinking);
  }
}

/**
 * 校验并规整选择：代理与模型必须可用；模型不支持推理时思考等级统一为 off。
 * previous 中已失效的另一项允许暂时保留，便于两个引用同时失效时逐项修复；执行前仍完整校验。
 */
export function normalizeSelection(config: ConfigurationSnapshot, selection: ConversationSelection, previous?: ConversationSelection): ConversationSelection {
  const agentAvailable = config.agents.some(agent => agent.id === selection.agentConfigurationId && agent.enabled);
  if (!agentAvailable && selection.agentConfigurationId !== previous?.agentConfigurationId) {
    throw new ConversationError("unavailable", "The selected agent configuration is unavailable.");
  }
  const resolved = resolveProviderModel(config, selection.modelId);
  if (!resolved) {
    if (selection.modelId !== previous?.modelId) throw new ConversationError("unavailable", "The selected model is unavailable.");
    return selection;
  }
  return resolved.model.capabilities.reasoning ? selection : { ...selection, thinking: "off" };
}
