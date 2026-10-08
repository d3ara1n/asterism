import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { ConfigurationService } from "../configuration/service.ts";
import { ConversationError, ConversationStore, canContinue, pathTo } from "../conversation/store.ts";
import { projectModel, type ModelItem } from "../conversation/projection.ts";
import { AiSdkAdapter } from "../model/ai-sdk.ts";
import { ModelFailure, type ModelAdapter } from "../model/contract.ts";
import { composeSystemPrompt } from "../model/system-prompt.ts";
import { runAgent } from "../execution/loop.ts";
import { allowedTool, type RuntimeTool } from "../execution/tools.ts";
import type { HistoryKernel } from "../history/kernel.ts";
import type { ObjectStore } from "./storage.ts";
import { SelectionRepository, normalizeSelection } from "./selections.ts";
import { resolveProviderModel, type AgentConfiguration, type ConfigurationSnapshot } from "../shared/configuration.ts";
import { conversationCommandSchema, conversationSnapshotSchema, jsonSchema, type ConversationCommand, type ConversationSnapshot,
  type ConversationChanged, type ConversationSelection, type ModelSettings } from "../shared/conversation.ts";

type Task = { id: string; branch_id: string };
type Submission = { task_id: string; agent_id: string; command_json: string };
type TurnCommand = Extract<ConversationCommand, { type: "start" | "submit" | "continue" }>;
/** 一轮执行所需的已解析环境；只在内存中存在，不写入历史。 */
interface Execution { taskId: string; agentId: string; branchId: string; agent: AgentConfiguration; settings: ModelSettings; selection: ConversationSelection; adapter: ModelAdapter }

export class ConversationService {
  private runs = new Map<string, { controller: AbortController; done: Promise<void> }>();
  private closed = false;
  private readonly selections: SelectionRepository;
  constructor(private readonly db: DatabaseSync, private readonly history: HistoryKernel, private readonly objects: ObjectStore,
    private readonly configuration: ConfigurationService, private readonly changed: (event: ConversationChanged) => void = () => {},
    private readonly adapterFactory?: (settings: ModelSettings) => ModelAdapter) {
    this.selections = new SelectionRepository(db);
    this.recover();
  }
  get running(): boolean { return this.runs.size > 0; }
  private task(id: string): Task {
    const task = this.db.prepare("SELECT id, branch_id FROM tasks WHERE id = ?").get(id) as Task | undefined;
    if (!task) throw new ConversationError("not_found", "Task not found.");
    return task;
  }
  private key(taskId: string, agentId: string): string { return JSON.stringify([taskId, agentId]); }
  private notify(taskId: string, agentId: string, seq?: number): void {
    try { this.changed({ kind: "conversation.changed", taskId, agentId, seq: seq ?? this.history.head(this.task(taskId).branch_id).seq,
      selectionRevision: this.selections.get(taskId, agentId)?.revision ?? 0 }); } catch { /* 查询始终可以恢复通知遗漏。 */ }
  }
  private store(taskId: string, agentId: string, notify = true): ConversationStore {
    const task = this.task(taskId);
    return new ConversationStore(this.history, task.branch_id, agentId, notify ? seq => this.notify(taskId, agentId, seq) : undefined);
  }
  private snapshot(taskId: string, agentId: string, atSeq?: number): ConversationSnapshot {
    const store = this.store(taskId, agentId);
    const state = store.read(atSeq);
    if (!state.created) throw new ConversationError("not_found", "Conversation not found.");
    const events = this.history.eventsOn(store.branchId).filter(e => atSeq === undefined || e.seq <= atSeq);
    const history = this.history.reconstruct(atSeq === undefined ? this.history.head(store.branchId)
      : { branch_id: store.branchId, event_id: events.at(-1)!.event_id, seq: atSeq });
    const latestTurn = events.findLast(e => e.type === "turn_started" && e.payload.agent_id === agentId);
    const failure = latestTurn?.type === "turn_started" ? events.findLast(e => e.type === "execution_failed" && e.payload.turn_id === latestTurn.payload.turn_id) : null;
    const current = this.selections.get(taskId, agentId);
    return conversationSnapshotSchema.parse({ taskId, agentId, cursor: state.cursor, seq: state.seq,
      nodes: [...state.nodes.values()], activeTurnId: history.in_flight_turns.find(t => t.agent_id === agentId)?.turn_id ?? null,
      agentName: current ? this.configuration.agentConfiguration(current.selection.agentConfigurationId)?.name ?? current.selection.agentConfigurationId : "Agent",
      selection: current?.selection ?? null, selectionRevision: current?.revision ?? 0,
      lastError: failure?.type === "execution_failed" ? { code: failure.payload.code, message: failure.payload.message } : null });
  }
  private ensureIdle(taskId: string, agentId: string): void {
    if (this.runs.has(this.key(taskId, agentId)) || this.history.reconstruct(this.history.head(this.task(taskId).branch_id)).in_flight_turns.some(t => t.agent_id === agentId)) {
      throw new ConversationError("conflict", "This agent is already running. Cancel or wait for the current turn.");
    }
  }
  private existing(command: Extract<ConversationCommand, { type: "start" | "submit" }>): ConversationSnapshot | null {
    const previous = this.db.prepare("SELECT * FROM conversation_submissions WHERE id = ?").get(command.submissionId) as Submission | undefined;
    if (!previous) return null;
    if (previous.command_json !== JSON.stringify(command)) throw new ConversationError("conflict", "This submission ID was already used for different input.");
    return this.snapshot(previous.task_id, previous.agent_id);
  }
  private async readConfiguration(): Promise<ConfigurationSnapshot> {
    const { snapshot } = await this.configuration.execute({ type: "read" });
    if (this.closed) throw new ConversationError("unavailable", "The conversation service is closed.");
    return snapshot;
  }
  async execute(raw: ConversationCommand): Promise<ConversationSnapshot> {
    if (this.closed) throw new ConversationError("unavailable", "The conversation service is closed.");
    const parsed = conversationCommandSchema.safeParse(raw);
    if (!parsed.success) throw new ConversationError("invalid_request", "Invalid conversation command.");
    const command = parsed.data;
    switch (command.type) {
      case "read": return this.snapshot(command.taskId, command.agentId, command.atSeq);
      case "cancel": {
        const snapshot = this.snapshot(command.taskId, command.agentId);
        this.runs.get(this.key(command.taskId, command.agentId))?.controller.abort();
        return snapshot;
      }
      case "select":
        this.ensureIdle(command.taskId, command.agentId);
        this.store(command.taskId, command.agentId).append({ type: "cursor.selected", nodeId: command.nodeId });
        return this.snapshot(command.taskId, command.agentId);
      case "configure": return this.configure(command);
      default: return this.runTurn(command);
    }
  }
  /** 当前选择的唯一写入口；规整结果由服务端决定，界面只显示返回值。 */
  private async configure(command: Extract<ConversationCommand, { type: "configure" }>): Promise<ConversationSnapshot> {
    const { taskId, agentId } = command;
    if (!this.store(taskId, agentId).read().created) throw new ConversationError("not_found", "Conversation not found.");
    const config = await this.readConfiguration();
    this.selections.save(taskId, agentId, normalizeSelection(config, command.selection, this.selections.get(taskId, agentId)?.selection));
    this.notify(taskId, agentId);
    return this.snapshot(taskId, agentId);
  }
  private async runTurn(command: TurnCommand): Promise<ConversationSnapshot> {
    if (command.type !== "continue") { const prior = this.existing(command); if (prior) return prior; }
    const config = await this.readConfiguration();
    // 配置读取会让出执行权；提交事务前重新检查幂等身份。
    if (command.type !== "continue") { const prior = this.existing(command); if (prior) return prior; }
    const execution = this.resolveExecution(command, config);
    const turnId = this.commitTurn(command, execution);
    this.launch(execution, turnId);
    return this.snapshot(execution.taskId, execution.agentId);
  }
  /** 从当前选择与最新配置解析本轮环境，并在提交输入前预检可判定的请求错误。 */
  private resolveExecution(command: TurnCommand, config: ConfigurationSnapshot): Execution {
    const isStart = command.type === "start";
    const taskId = isStart ? randomUUID() : command.taskId;
    const agentId = isStart ? randomUUID() : command.agentId;
    let messages: ModelItem[] = [];
    let selection: ConversationSelection;
    if (isStart) selection = normalizeSelection(config, { agentConfigurationId: command.agentConfigurationId, modelId: command.modelId, thinking: command.thinking });
    else {
      this.ensureIdle(taskId, agentId);
      const state = this.store(taskId, agentId).read();
      if (!state.created) throw new ConversationError("not_found", "Conversation not found.");
      if (pathTo(state).some(n => !canContinue(n))) throw new ConversationError("conflict", "Select a complete history position before continuing.");
      const current = this.selections.get(taskId, agentId);
      if (!current) throw new ConversationError("not_found", "Conversation selection not found.");
      selection = current.selection;
      messages = projectModel(state);
    }
    const agent = config.agents.find(a => a.id === selection.agentConfigurationId && a.enabled);
    if (!agent) throw new ConversationError("unavailable", "Agent configuration is unavailable. Choose an available agent.");
    if (agent.maxCost !== null) throw new ConversationError("unavailable", "Cost limits require model pricing support, which is not available yet.");
    const resolved = resolveProviderModel(config, selection.modelId);
    if (!resolved) throw new ConversationError("unavailable", "The model or provider is unavailable.");
    if (resolved.provider.auth === "api_key" && resolved.provider.credentialState !== "available") throw new ConversationError("unavailable", "Provider credentials are unavailable.");
    if (selection.thinking && selection.thinking !== "off" && !resolved.model.capabilities.reasoning) throw new ConversationError("invalid_request", "This model does not support thinking.");
    const { credentialState: _credentialState, ...provider } = resolved.provider;
    const settings: ModelSettings = { provider, model: resolved.model, thinking: selection.thinking };
    const branchId = isStart ? randomUUID() : this.task(taskId).branch_id;
    let credential: Promise<string | null> | undefined;
    const adapter = this.adapterFactory?.(settings) ?? new AiSdkAdapter(() => credential ??= this.configuration.executionCredential(provider.id, provider.revision));
    if (command.type !== "continue") messages.push({ kind: "input", text: command.text });
    try {
      // prepare 不访问网络或凭据。
      adapter.prepare({ settings, system: composeSystemPrompt(agent), messages, tools: this.declarations(branchId, agent, settings) });
    } catch (error) {
      throw new ConversationError("invalid_request", error instanceof ModelFailure ? error.message : "The model request cannot be prepared.");
    }
    return { taskId, agentId, branchId, agent, settings, selection, adapter };
  }
  private declarations(branchId: string, agent: AgentConfiguration, settings: ModelSettings) {
    if (!settings.model.capabilities.tools) return [];
    return this.tools(branchId).filter(t => allowedTool(agent, t.name)).map(({ name, description, parameters }) => ({ name, description, parameters }));
  }
  /** 在单个事务内建立任务（首次）、输入节点和轮次。 */
  private commitTurn(command: TurnCommand, { taskId, agentId, branchId, agent, selection }: Execution): string {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (command.type === "start") {
        const title = command.text.slice(0, 72);
        this.history.append(branchId, { type: "task_created", payload: { task_id: taskId, title } });
        this.history.append(branchId, { type: "branch_created", payload: { task_id: taskId, branch_id: branchId } });
        this.db.prepare("INSERT INTO tasks (id, branch_id, title, created_at) VALUES (?, ?, ?, ?)").run(taskId, branchId, title, new Date().toISOString());
        this.history.append(branchId, { type: "agent_created", payload: { agent_id: agentId, title: agent.name } });
        this.store(taskId, agentId, false).append({ type: "created" });
        // 工作台视图与领域对象同时建立；位置只是视图状态。
        this.db.prepare("INSERT INTO object_views (task_id, object_id, x, y) VALUES (?, ?, ?, ?)").run(taskId, agentId, 48, 48);
        this.selections.save(taskId, agentId, selection);
      }
      const store = this.store(taskId, agentId, false);
      if (command.type !== "continue") {
        store.append({ type: "node.appended", node: { id: randomUUID(), parentId: store.read().cursor, kind: "input", text: command.text, createdAt: new Date().toISOString() } });
        this.db.prepare("INSERT INTO conversation_submissions (id, command_json, task_id, agent_id) VALUES (?, ?, ?, ?)")
          .run(command.submissionId, JSON.stringify(command), taskId, agentId);
      }
      const cursor = store.read().cursor;
      if (cursor === null) throw new ConversationError("invalid_request", "A conversation needs input before it can continue.");
      const turnId = this.history.startTurn(branchId, { agent_id: agentId, input: { nodeId: cursor } }).turn_id;
      this.db.exec("COMMIT");
      return turnId;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  /** 后台执行本轮；凭据只在本轮内存中保留，不进入历史或 renderer。 */
  private launch({ taskId, agentId, branchId, agent, settings, adapter }: Execution, turnId: string): void {
    const store = this.store(taskId, agentId);
    const turn = this.history.reconstruct(this.history.head(branchId)).in_flight_turns.find(t => t.turn_id === turnId)!;
    const controller = new AbortController();
    const key = this.key(taskId, agentId);
    const timer = setTimeout(() => controller.abort(), (agent.timeout ?? 600) * 1000);
    const done = Promise.resolve().then(() => runAgent({ store, adapter, agent, settings, turn, signal: controller.signal, tools: this.tools(branchId) }))
      .catch(() => { console.error("Conversation execution could not be finalized."); })
      .finally(() => { clearTimeout(timer); this.runs.delete(key); this.notify(taskId, agentId); });
    this.runs.set(key, { controller, done });
    this.notify(taskId, agentId);
  }
  private tools(branchId: string): RuntimeTool[] {
    const schema = z.strictObject({ resource_id: z.string().min(1) });
    return [{ name: "read", description: "Read an authorized note by its resource_id. Workspace paths do not grant access.",
      parameters: jsonSchema.parse(z.toJSONSchema(schema)), schema, permission: "read", effect: "read", execution: "parallel",
      execute: async (args, signal) => {
        signal.throwIfAborted();
        const { resource_id } = schema.parse(args);
        const created = this.history.eventsOn(branchId).find(e => e.type === "resource_created" && e.payload.resource_id === resource_id);
        const resource = created?.type === "resource_created" ? created.payload : null;
        if (!resource || resource.type !== "note" || !resource.content_ref) return { kind: "failed", error: { code: "resource_unavailable", message: "The note content is unavailable." } };
        const content = this.objects.get(resource.content_ref);
        if (content === null) return { kind: "failed", error: { code: "object_missing", message: "The note object is missing." } };
        return { kind: "succeeded", model: { resource_id, text: content }, data: { resource_id, content_ref: resource.content_ref, text: content } };
      } }];
  }
  private recover(): void {
    const tasks = this.db.prepare("SELECT id, branch_id FROM tasks").all() as Task[];
    for (const task of tasks) {
      const events = this.history.eventsOn(task.branch_id);
      const agents = new Set(events.flatMap(e => e.type === "conversation_event" ? [e.payload.agentId] : []));
      const finished = new Set(events.flatMap(e => e.type === "operation_finished" ? [e.payload.operation_id] : []));
      for (const event of events) if (event.type === "operation_started" && agents.has(event.payload.agent_id) && !finished.has(event.payload.operation_id)) {
        this.history.append(task.branch_id, { type: "operation_finished", payload: { operation_id: event.payload.operation_id, status: "unknown",
          result: { kind: "unknown", message: "The process stopped before the operation result was recorded." } } });
      }
      for (const agentId of agents) this.store(task.id, agentId, false).recover();
      for (const turn of this.history.reconstruct(this.history.head(task.branch_id)).in_flight_turns) {
        if (agents.has(turn.agent_id)) this.history.endTurn(task.branch_id, { turn_id: turn.turn_id, status: "interrupted" });
      }
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const run of this.runs.values()) run.controller.abort();
    await Promise.allSettled([...this.runs.values()].map(run => run.done));
  }
}
