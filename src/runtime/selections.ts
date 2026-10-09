import type { DatabaseSync } from "node:sqlite";
import { resolveProviderModel, type ConfigurationSnapshot } from "../shared/configuration.ts";
import { agentSelectionSchema, type AgentSelection } from "../shared/model.ts";
import { SessionError } from "../session/tree.ts";

/** 代理当前选择：属于环境，可修改，不进会话树。 */
export class SelectionRepository {
  constructor(private readonly db: DatabaseSync) {}
  get(sessionId: string, agentId: string): { selection: AgentSelection; revision: number } | null {
    const row = this.db.prepare(`SELECT agent_configuration_id AS agentConfigurationId, model_id AS modelId, thinking, revision
      FROM agent_selections WHERE session_id = ? AND agent_id = ?`).get(sessionId, agentId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const { revision, ...selection } = row;
    return { selection: agentSelectionSchema.parse(selection), revision: Number(revision) };
  }
  save(sessionId: string, agentId: string, selection: AgentSelection): void {
    this.db.prepare(`INSERT INTO agent_selections (session_id, agent_id, agent_configuration_id, model_id, thinking)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(session_id, agent_id) DO UPDATE SET
      agent_configuration_id = excluded.agent_configuration_id, model_id = excluded.model_id, thinking = excluded.thinking,
      revision = agent_selections.revision + 1`)
      .run(sessionId, agentId, selection.agentConfigurationId, selection.modelId, selection.thinking);
  }
}

/** 校验并规整选择；已失效的另一项可暂时保留以便逐项修复，执行前仍完整校验。 */
export function normalizeSelection(config: ConfigurationSnapshot, selection: AgentSelection, previous?: AgentSelection): AgentSelection {
  const agentAvailable = config.agents.some(agent => agent.id === selection.agentConfigurationId && agent.enabled);
  if (!agentAvailable && selection.agentConfigurationId !== previous?.agentConfigurationId) {
    throw new SessionError("unavailable", "The selected agent configuration is unavailable.");
  }
  const resolved = resolveProviderModel(config, selection.modelId);
  if (!resolved) {
    if (selection.modelId !== previous?.modelId) throw new SessionError("unavailable", "The selected model is unavailable.");
    return selection;
  }
  return resolved.model.capabilities.reasoning ? selection : { ...selection, thinking: "off" };
}
