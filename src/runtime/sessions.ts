import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ConfigurationService } from "../configuration/service.ts";
import { AiSdkAdapter } from "../model/ai-sdk.ts";
import { ModelFailure, type ModelAdapter } from "../model/contract.ts";
import { composeSystemPrompt } from "../model/system-prompt.ts";
import { runAgent } from "../execution/loop.ts";
import { allowedTool, type RuntimeTool } from "../execution/tools.ts";
import { SessionError, SessionTree } from "../session/tree.ts";
import { projectForAgent } from "../session/projection.ts";
import { foldWorkbench, type FoldedObject } from "../session/fold.ts";
import { directoryType, noteType, readContextFiles } from "../resources/index.ts";
import { globalTools } from "../resources/global.ts";
import type { ObjectStore } from "./storage.ts";
import { SelectionRepository, normalizeSelection } from "./selections.ts";
import { resolveProviderModel, type AgentConfiguration, type ConfigurationSnapshot } from "../shared/configuration.ts";
import { type AgentSelection, type ModelSettings } from "../shared/model.ts";
import { sessionCommandSchema, sessionSnapshotSchema, type SessionChanged, type SessionCommand, type SessionSnapshot } from "../shared/session.ts";

type TurnCommand = Extract<SessionCommand, { type: "start" | "submit" | "continue" }>;
/** 一轮执行的已解析环境；只在内存中存在，不写入会话树。 */
interface Execution { sessionId: string; agentId: string; agent: AgentConfiguration; settings: ModelSettings; selection: AgentSelection; adapter: ModelAdapter }

export class SessionService {
  private runs = new Map<string, { controller: AbortController; done: Promise<void> }>();
  private closed = false;
  readonly tree: SessionTree;
  private readonly selections: SelectionRepository;
  constructor(private readonly db: DatabaseSync, private readonly objects: ObjectStore, private readonly configuration: ConfigurationService,
    private readonly changed: (event: SessionChanged) => void = () => {}, private readonly adapterFactory?: (settings: ModelSettings) => ModelAdapter) {
    this.tree = new SessionTree(db);
    this.selections = new SelectionRepository(db);
  }
  get running(): boolean { return this.runs.size > 0; }
  private key(sessionId: string, agentId: string) { return `${sessionId}:${agentId}`; }
  /** 会话 settled：其中没有任何代理在运行。 */
  private settled(sessionId: string): boolean { return ![...this.runs.keys()].some(k => k.startsWith(`${sessionId}:`)); }
  notify(sessionId: string): void {
    try { this.changed({ kind: "session.changed", sessionId, seq: this.tree.head(sessionId), selectionRevision: this.selections.revision(sessionId) }); }
    catch { /* 查询可恢复遗漏的通知 */ }
  }
  snapshot(sessionId: string): SessionSnapshot {
    const nodes = this.tree.nodes(sessionId);
    const agents = foldWorkbench(nodes).objects.filter(o => o.kind === "agent").map(o => {
      const current = this.selections.get(sessionId, o.id);
      return { id: o.id, running: this.runs.has(this.key(sessionId, o.id)),
        name: current ? this.configuration.agentConfiguration(current.selection.agentConfigurationId)?.name ?? o.title : o.title,
        selection: current?.selection ?? null, selectionRevision: current?.revision ?? 0 };
    });
    return sessionSnapshotSchema.parse({ sessionId, title: this.tree.title(sessionId), cursor: this.tree.cursor(sessionId), seq: this.tree.head(sessionId),
      nodes, agents, running: !this.settled(sessionId), selectionRevision: this.selections.revision(sessionId) });
  }
  private existing(command: Extract<SessionCommand, { type: "start" | "submit" }>): SessionSnapshot | null {
    const row = this.db.prepare("SELECT session_id, command_json FROM session_submissions WHERE id = ?").get(command.submissionId) as { session_id: string; command_json: string } | undefined;
    if (!row) return null;
    if (row.command_json !== JSON.stringify(command)) throw new SessionError("conflict", "This submission ID was already used for different input.");
    return this.snapshot(row.session_id);
  }
  private async readConfiguration(): Promise<ConfigurationSnapshot> {
    const { snapshot } = await this.configuration.execute({ type: "read" });
    if (this.closed) throw new SessionError("unavailable", "The session service is closed.");
    return snapshot;
  }
  async execute(raw: SessionCommand): Promise<SessionSnapshot> {
    if (this.closed) throw new SessionError("unavailable", "The session service is closed.");
    const parsed = sessionCommandSchema.safeParse(raw);
    if (!parsed.success) throw new SessionError("invalid_request", "Invalid session command.");
    const command = parsed.data;
    switch (command.type) {
      case "read": return this.snapshot(command.sessionId);
      case "cancel":
        for (const [k, run] of this.runs) if (k.startsWith(`${command.sessionId}:`)) run.controller.abort();
        return this.snapshot(command.sessionId);
      case "select":
        if (!this.settled(command.sessionId)) throw new SessionError("conflict", "Wait for or stop running agents before moving through history.");
        this.tree.select(command.sessionId, command.nodeId);
        this.notify(command.sessionId);
        return this.snapshot(command.sessionId);
      case "configure": {
        const config = await this.readConfiguration();
        if (!foldWorkbench(this.tree.nodes(command.sessionId)).objects.some(o => o.id === command.agentId)) throw new SessionError("not_found", "Agent not found.");
        this.selections.save(command.sessionId, command.agentId, normalizeSelection(config, command.selection, this.selections.get(command.sessionId, command.agentId)?.selection));
        this.notify(command.sessionId);
        return this.snapshot(command.sessionId);
      }
      default: return this.runTurn(command);
    }
  }
  private async runTurn(command: TurnCommand): Promise<SessionSnapshot> {
    if (command.type !== "continue") { const prior = this.existing(command); if (prior) return prior; }
    const config = await this.readConfiguration();
    if (command.type !== "continue") { const prior = this.existing(command); if (prior) return prior; }
    const execution = this.resolve(command, config);
    this.commit(command, execution);
    this.launch(execution);
    return this.snapshot(execution.sessionId);
  }
  /** 从当前选择与最新配置解析环境，并在提交输入前预检请求。 */
  private resolve(command: TurnCommand, config: ConfigurationSnapshot): Execution {
    const isStart = command.type === "start";
    const sessionId = isStart ? randomUUID() : command.sessionId;
    const agentId = isStart ? randomUUID() : command.agentId;
    let selection: AgentSelection;
    let messages = [] as ReturnType<typeof projectForAgent>;
    if (isStart) selection = normalizeSelection(config, { agentConfigurationId: command.agentConfigurationId, modelId: command.modelId, thinking: command.thinking });
    else {
      if (!this.settled(sessionId)) throw new SessionError("conflict", "An agent in this session is running. Cancel or wait for it to finish.");
      const current = this.selections.get(sessionId, agentId);
      if (!current) throw new SessionError("not_found", "Agent not found.");
      selection = current.selection;
      messages = projectForAgent(this.tree.path(sessionId), agentId);
    }
    const agent = config.agents.find(a => a.id === selection.agentConfigurationId && a.enabled);
    if (!agent) throw new SessionError("unavailable", "Agent configuration is unavailable. Choose an available agent.");
    if (agent.maxCost !== null) throw new SessionError("unavailable", "Cost limits require model pricing support, which is not available yet.");
    const resolved = resolveProviderModel(config, selection.modelId);
    if (!resolved) throw new SessionError("unavailable", "The model or provider is unavailable.");
    if (resolved.provider.auth === "api_key" && resolved.provider.credentialState !== "available") throw new SessionError("unavailable", "Provider credentials are unavailable.");
    const { credentialState: _c, ...provider } = resolved.provider;
    const settings: ModelSettings = { provider, model: resolved.model, thinking: selection.thinking };
    let credential: Promise<string | null> | undefined;
    const adapter = this.adapterFactory?.(settings) ?? new AiSdkAdapter(() => credential ??= this.configuration.executionCredential(provider.id, provider.revision));
    if (command.type !== "continue") messages.push({ kind: "input", text: command.text });
    try {
      adapter.prepare({ settings, system: composeSystemPrompt(agent), messages, tools: settings.model.capabilities.tools
        ? this.tools(sessionId, agentId).filter(t => allowedTool(agent, t.name)).map(({ name, description, parameters }) => ({ name, description, parameters })) : [] });
    } catch (error) {
      throw new SessionError("invalid_request", error instanceof ModelFailure ? error.message : "The model request cannot be prepared.");
    }
    return { sessionId, agentId, agent, settings, selection, adapter };
  }
  /** 单事务：首次建立会话与代理对象事件，追加输入。 */
  private commit(command: TurnCommand, { sessionId, agentId, agent, selection }: Execution): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (command.type === "start") {
        this.tree.create(command.text.slice(0, 72), sessionId);
        this.tree.append(sessionId, { kind: "event", agentId: null, type: "agent_created", data: { id: agentId, title: agent.name }, model: null });
        this.db.prepare("INSERT INTO object_views (session_id, object_id, x, y) VALUES (?, ?, ?, ?)").run(sessionId, agentId, 48, 48);
        this.selections.save(sessionId, agentId, selection);
      }
      if (command.type !== "continue") {
        this.tree.append(sessionId, { kind: "message", agentId, text: command.text });
        this.db.prepare("INSERT INTO session_submissions (id, command_json, session_id, agent_id) VALUES (?, ?, ?, ?)")
          .run(command.submissionId, JSON.stringify(command), sessionId, agentId);
      }
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private launch({ sessionId, agentId, agent, settings, adapter }: Execution): void {
    const controller = new AbortController();
    const key = this.key(sessionId, agentId);
    const timer = setTimeout(() => controller.abort(), (agent.timeout ?? 600) * 1000);
    const done = Promise.resolve().then(() => runAgent({ tree: this.tree, sessionId, agentId, adapter, agent, settings,
      tools: this.tools(sessionId, agentId), signal: controller.signal, changed: () => this.notify(sessionId),
      context: () => readContextFiles(this.linked(sessionId, agentId).filter(o => o.kind === "directory")) }))
      .catch(() => { console.error("Session execution could not be finalized."); })
      .finally(() => { clearTimeout(timer); this.runs.delete(key); this.notify(sessionId); });
    this.runs.set(key, { controller, done });
    this.notify(sessionId);
  }
  /** 顶层全局资源工具；授权按当前路径上该代理的链接折叠。 */
  private tools(sessionId: string, agentId?: string): RuntimeTool[] {
    return globalTools([noteType(this.objects), directoryType], () => this.linked(sessionId, agentId));
  }
  private linked(sessionId: string, agentId?: string): FoldedObject[] {
    if (!agentId) return [];
    const folded = foldWorkbench(this.tree.path(sessionId));
    const ids = new Set(folded.links.filter(l => l.agentId === agentId).map(l => l.resourceId));
    return folded.objects.filter(o => ids.has(o.id));
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const run of this.runs.values()) run.controller.abort();
    await Promise.allSettled([...this.runs.values()].map(run => run.done));
  }
}
