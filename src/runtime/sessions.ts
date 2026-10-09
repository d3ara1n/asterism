import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ConfigurationService } from "../configuration/service.ts";
import { AiSdkAdapter } from "../model/ai-sdk.ts";
import { ModelFailure, type ModelAdapter } from "../model/contract.ts";
import { composeSystemPrompt } from "../model/system-prompt.ts";
import { runAgent, type RequestEnvironment } from "../execution/loop.ts";
import { weftDeclarations } from "../execution/weft.ts";
import { SessionError, SessionTree } from "../session/tree.ts";
import { projectForAgent } from "../session/projection.ts";
import { foldWorkbench, type FoldedObject } from "../session/fold.ts";
import type { ResourceRegistry } from "../resources/registry.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import { AgentCapabilities, agentToolPolicy } from "../execution/capabilities.ts";
import { SelectionRepository, normalizeSelection } from "./selections.ts";
import { resolveProviderModel, type AgentConfiguration, type ConfigurationSnapshot } from "../shared/configuration.ts";
import { type AgentSelection, type Json, type ModelSettings } from "../shared/model.ts";
import { sessionCommandSchema, sessionSnapshotSchema, type LiveBlock, type SessionChanged, type SessionCommand, type SessionSnapshot,
  type SessionProgress, type SessionReply, type ViewPosition } from "../shared/session.ts";
import { sessionPath, snap } from "../shared/session-path.ts";
import { SessionWorkbench } from "./workbench.ts";
import type { ObjectStore } from "./storage.ts";

type TurnCommand = Extract<SessionCommand, { type: "start" | "submit" | "continue" }>;
/** 一轮执行的已解析环境；只在内存中存在，不写入会话树。 */
interface Execution { sessionId: string; agentId: string; cursor: string | null; agent: AgentConfiguration; selection: AgentSelection }

export class SessionService {
  private runs = new Map<string, { sessionId: string; agentId: string; controller: AbortController; done: Promise<void>; live: LiveBlock[] }>();
  private revisions = new Map<string, number>();
  private progressVersions = new Map<string, number>();
  private closed = false;
  readonly tree: SessionTree;
  private readonly selections: SelectionRepository;
  private readonly workbench: SessionWorkbench;
  constructor(private readonly db: DatabaseSync,
    private readonly catalogs: { resources: ResourceRegistry; tools: ToolRegistry },
    objects: ObjectStore,
    private readonly configuration: ConfigurationService,
    private readonly changed: (event: SessionChanged) => void = () => {}, private readonly adapterFactory?: (settings: ModelSettings) => ModelAdapter) {
    this.tree = new SessionTree(db);
    this.selections = new SelectionRepository(db);
    this.workbench = new SessionWorkbench(db, this.tree, objects, catalogs.resources,
      (sessionId, agentId, resource) => this.resourceTools(sessionId, agentId, resource));
  }
  get running(): boolean { return this.runs.size > 0; }
  private key(sessionId: string, agentId: string) { return `${sessionId}:${agentId}`; }
  /** 会话 settled：其中没有任何代理在运行。 */
  private settled(sessionId: string): boolean { return ![...this.runs.values()].some(run => run.sessionId === sessionId); }
  private notify(sessionId: string): void {
    const revision = (this.revisions.get(sessionId) ?? 0) + 1;
    this.revisions.set(sessionId, revision);
    try { this.changed({ kind: "session.changed", sessionId, revision }); }
    catch { /* 查询可恢复遗漏的通知 */ }
  }
  private progress(sessionId: string): SessionProgress {
    const runs = [...this.runs.values()].filter(run => run.sessionId === sessionId);
    return { revision: this.revisions.get(sessionId) ?? 0, version: this.progressVersions.get(sessionId) ?? 0,
      runningAgentIds: runs.map(run => run.agentId), live: runs.flatMap(run => run.live) };
  }
  private progressChanged(sessionId: string): void {
    this.progressVersions.set(sessionId, (this.progressVersions.get(sessionId) ?? 0) + 1);
    try { this.changed({ kind: "session.progress", sessionId, progress: this.progress(sessionId) }); }
    catch { /* 重新读取会话恢复当前进度 */ }
  }
  snapshot(sessionId: string, position: ViewPosition = { kind: "live" }): SessionSnapshot {
    const nodes = this.tree.nodes(sessionId);
    const cursor = this.tree.cursor(sessionId);
    const at = position.kind === "live" ? cursor : position.nodeId;
    const path = sessionPath(nodes, at);
    const agents = foldWorkbench(path).objects.filter(o => o.kind === "agent").map(o => {
      const current = this.selections.get(sessionId, o.id);
      return { id: o.id,
        name: current ? this.configuration.agentConfiguration(current.selection.agentConfigurationId)?.name ?? o.title : o.title,
        selection: current?.selection ?? null, selectionRevision: current?.revision ?? 0 };
    });
    const title = this.tree.title(sessionId);
    return sessionSnapshotSchema.parse({ sessionId, title, cursor, at, seq: this.tree.head(sessionId),
      revision: this.revisions.get(sessionId) ?? 0, nodes, agents, progress: this.progress(sessionId),
      workbench: this.workbench.project(sessionId, title, path) });
  }
  private existing(command: Extract<SessionCommand, { type: "start" | "submit" }>): SessionReply | null {
    const row = this.db.prepare("SELECT session_id, command_json FROM session_submissions WHERE id = ?").get(command.submissionId) as { session_id: string; command_json: string } | undefined;
    if (!row) return null;
    if (row.command_json !== JSON.stringify(command)) throw new SessionError("conflict", "This submission ID was already used for different input.");
    return { kind: "accepted", sessionId: row.session_id };
  }
  private async readConfiguration(): Promise<ConfigurationSnapshot> {
    const { snapshot } = await this.configuration.execute({ type: "read" });
    if (this.closed) throw new SessionError("unavailable", "The session service is closed.");
    return snapshot;
  }
  async execute(raw: SessionCommand): Promise<SessionReply> {
    if (this.closed) throw new SessionError("unavailable", "The session service is closed.");
    const parsed = sessionCommandSchema.safeParse(raw);
    if (!parsed.success) throw new SessionError("invalid_request", "Invalid session command.");
    const command = parsed.data;
    switch (command.type) {
      case "read": return { kind: "view", snapshot: this.snapshot(command.sessionId, command.position) };
      case "cancel":
        for (const run of this.runs.values()) if (run.sessionId === command.sessionId) run.controller.abort();
        this.tree.cursor(command.sessionId);
        return { kind: "accepted", sessionId: command.sessionId };
      case "select":
        if (!this.settled(command.sessionId)) throw new SessionError("conflict", "Wait for or stop running agents before moving through history.");
        this.tree.select(command.sessionId, command.nodeId);
        this.notify(command.sessionId);
        return { kind: "accepted", sessionId: command.sessionId };
      case "configure": {
        const config = await this.readConfiguration();
        this.requireAgent(command.sessionId, command.agentId);
        this.selections.save(command.sessionId, command.agentId, normalizeSelection(config, command.selection, this.selections.get(command.sessionId, command.agentId)?.selection));
        this.notify(command.sessionId);
        return { kind: "accepted", sessionId: command.sessionId };
      }
      case "start": case "submit": case "continue": return this.runTurn(command);
      default: {
        this.db.exec("BEGIN IMMEDIATE");
        try {
          this.workbench.mutate(command);
          this.db.exec("COMMIT");
        } catch (error) { this.db.exec("ROLLBACK"); throw error; }
        this.notify(command.sessionId);
        return { kind: "accepted", sessionId: command.sessionId };
      }
    }
  }
  private async runTurn(command: TurnCommand): Promise<SessionReply> {
    if (command.type !== "continue") { const prior = this.existing(command); if (prior) return prior; }
    const config = await this.readConfiguration();
    if (command.type !== "continue") { const prior = this.existing(command); if (prior) return prior; }
    const execution = this.resolve(command, config);
    this.commit(command, execution);
    this.launch(execution);
    return { kind: "accepted", sessionId: execution.sessionId };
  }
  /** 从当前选择与最新配置解析环境，并在提交输入前预检请求。 */
  private resolve(command: TurnCommand, config: ConfigurationSnapshot): Execution {
    const isStart = command.type === "start";
    const sessionId = isStart ? randomUUID() : command.sessionId;
    const agentId = isStart ? randomUUID() : command.agentId;
    let cursor: string | null = null;
    let selection: AgentSelection;
    let messages: ReturnType<typeof projectForAgent> = [];
    if (isStart) selection = normalizeSelection(config, { agentConfigurationId: command.agentConfigurationId, modelId: command.modelId, thinking: command.thinking });
    else {
      if (!this.settled(sessionId)) throw new SessionError("conflict", "An agent in this session is running. Cancel or wait for it to finish.");
      const nodes = this.tree.nodes(sessionId);
      const currentCursor = this.tree.cursor(sessionId);
      cursor = currentCursor === null ? null : snap(nodes, currentCursor);
      this.requireAgent(sessionId, agentId, cursor);
      const current = this.selections.get(sessionId, agentId);
      if (!current) throw new SessionError("not_found", "Agent not found.");
      selection = current.selection;
      messages = projectForAgent(sessionPath(nodes, cursor), agentId);
    }
    const { agent, settings, adapter } = this.resolveEnvironment(config, selection);
    if (command.type !== "continue") messages.push({ kind: "input", text: command.text });
    try {
      adapter.prepare({ settings, system: composeSystemPrompt(agent), messages,
        tools: settings.model.capabilities.tools ? weftDeclarations() : [] });
    } catch (error) {
      throw new SessionError("invalid_request", error instanceof ModelFailure ? error.message : "The model request cannot be prepared.");
    }
    return { sessionId, agentId, cursor, agent, selection };
  }
  private resolveEnvironment(config: ConfigurationSnapshot, selection: AgentSelection): Pick<RequestEnvironment, "agent" | "settings" | "adapter"> {
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
    return { agent, settings, adapter };
  }
  /** 单事务：首次建立会话与代理对象事件，追加输入。 */
  private commit(command: TurnCommand, { sessionId, agentId, cursor, agent, selection }: Execution): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (command.type === "start") {
        this.tree.create(command.text.slice(0, 72), sessionId);
        this.tree.append(sessionId, { kind: "event", agentId: null, type: "agent_created", data: { id: agentId, title: agent.name }, model: null });
        this.db.prepare("INSERT INTO object_views (session_id, object_id, x, y) VALUES (?, ?, ?, ?)").run(sessionId, agentId, 48, 48);
        this.selections.save(sessionId, agentId, selection);
      } else if (cursor !== this.tree.cursor(sessionId)) {
        this.tree.select(sessionId, this.tree.cursor(sessionId), "continuation");
      }
      if (command.type !== "continue") {
        this.tree.append(sessionId, { kind: "message", agentId, text: command.text });
        this.db.prepare("INSERT INTO session_submissions (id, command_json, session_id, agent_id) VALUES (?, ?, ?, ?)")
          .run(command.submissionId, JSON.stringify(command), sessionId, agentId);
      }
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private launch({ sessionId, agentId, agent }: Execution): void {
    const controller = new AbortController();
    const key = this.key(sessionId, agentId);
    const timer = setTimeout(() => controller.abort(), (agent.timeout ?? 600) * 1000);
    let progressTimer: ReturnType<typeof setTimeout> | undefined;
    const done = Promise.resolve().then(() => runAgent({ tree: this.tree, sessionId, agentId,
      signal: controller.signal, changed: () => this.notify(sessionId),
      progress: blocks => {
        this.runs.get(key)!.live = blocks;
        this.progressVersions.set(sessionId, (this.progressVersions.get(sessionId) ?? 0) + 1);
        progressTimer ??= setTimeout(() => { progressTimer = undefined; this.progressChanged(sessionId); }, 32);
      },
      environment: async () => {
        const config = await this.readConfiguration();
        const current = this.selections.get(sessionId, agentId);
        if (!current) throw new SessionError("not_found", "Agent not found.");
        // 消息、资源和策略取自同一请求边界；随后读取环境文件期间发生的事件也留到下次请求。
        const path = this.tree.path(sessionId);
        const environment = this.resolveEnvironment(config, current.selection);
        const folded = foldWorkbench(path);
        const ids = new Set(folded.links.filter(link => link.agentId === agentId).map(link => link.resourceId));
        const linked = folded.objects.filter(object => ids.has(object.id));
        return { ...environment, messages: projectForAgent(path, agentId), requestParentId: path.at(-1)?.id ?? null,
          capabilities: this.capabilities(linked, environment.agent),
          context: await this.catalogs.resources.context(linked) };
      } }))
      .catch(() => { console.error("Session execution could not be finalized."); })
      .finally(() => { clearTimeout(timer); clearTimeout(progressTimer); this.runs.delete(key); this.progressChanged(sessionId); });
    this.runs.set(key, { sessionId, agentId, controller, done, live: [] });
    this.progressVersions.set(sessionId, (this.progressVersions.get(sessionId) ?? 0) + 1);
    this.notify(sessionId);
  }
  /** 链接通知与 inspect/call 共享目录，按同一代理工具策略给出摘要。 */
  private resourceTools(sessionId: string, agentId: string, resource: FoldedObject): Json {
    const current = this.selections.get(sessionId, agentId);
    const agent = current && this.configuration.agentConfiguration(current.selection.agentConfigurationId);
    return agent ? this.capabilities([resource], agent).describe(resource.id) : [];
  }
  private capabilities(linked: readonly FoldedObject[], agent: AgentConfiguration): AgentCapabilities {
    return new AgentCapabilities(this.catalogs.resources, this.catalogs.tools, linked, agentToolPolicy(agent));
  }
  private requireAgent(sessionId: string, agentId: string, at = this.tree.cursor(sessionId)): void {
    if (!foldWorkbench(this.tree.path(sessionId, at)).objects.some(o => o.id === agentId && o.kind === "agent")) {
      throw new SessionError("not_found", "Agent not found on the current session path.");
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const run of this.runs.values()) run.controller.abort();
    await Promise.allSettled([...this.runs.values()].map(run => run.done));
  }
}
