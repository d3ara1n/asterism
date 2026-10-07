import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { ConfigurationService } from "../configuration/service.ts";
import { ConversationError, ConversationStore, canContinue, pathTo } from "../conversation/store.ts";
import { projectModel, type ModelItem } from "../conversation/projection.ts";
import { AiSdkAdapter } from "../model/ai-sdk.ts";
import { ModelFailure, type ModelAdapter } from "../model/contract.ts";
import { runAgent } from "../execution/loop.ts";
import { allowedTool, type RuntimeTool } from "../execution/tools.ts";
import type { HistoryKernel } from "../history/kernel.ts";
import type { ObjectStore } from "./storage.ts";
import { resolveProviderModel, type AgentConfiguration, type ThinkingLevel } from "../shared/configuration.ts";
import { conversationCommandSchema, conversationSnapshotSchema, jsonSchema, type ConversationCommand, type ConversationSnapshot, type ConversationChanged, type ModelSettings } from "../shared/conversation.ts";

type Task = { id: string; branch_id: string };
type Submission = { task_id: string; agent_id: string; command_json: string };
export class ConversationService {
  private runs = new Map<string, { controller: AbortController; done: Promise<void> }>();
  private closed = false;
  constructor(private readonly db: DatabaseSync, private readonly history: HistoryKernel, private readonly objects: ObjectStore,
    private readonly configuration: ConfigurationService, private readonly changed: (event: ConversationChanged) => void = () => {},
    private readonly adapterFactory?: (settings: ModelSettings) => ModelAdapter) { this.recover(); }
  get running(): boolean { return this.runs.size > 0; }
  private task(id: string): Task {
    const task = this.db.prepare("SELECT id, branch_id FROM tasks WHERE id = ?").get(id) as Task | undefined;
    if (!task) throw new ConversationError("not_found", "Task not found.");
    return task;
  }
  private key(taskId: string, agentId: string): string { return JSON.stringify([taskId, agentId]); }
  private notify(taskId: string, agentId: string, seq?: number): void {
    try { this.changed({ kind: "conversation.changed", taskId, agentId, seq: seq ?? this.history.head(this.task(taskId).branch_id).seq }); } catch { /* 查询始终可以恢复通知遗漏。 */ }
  }
  private store(taskId: string, agentId: string, notify = true): ConversationStore {
    const task = this.task(taskId);
    return new ConversationStore(this.history, task.branch_id, agentId, notify ? seq => this.notify(taskId, agentId, seq) : undefined);
  }
  private snapshot(taskId: string, agentId: string, atSeq?: number): ConversationSnapshot {
    const store = this.store(taskId, agentId);
    const state = store.read(atSeq);
    if (!state.agent) throw new ConversationError("not_found", "Conversation not found.");
    const history = atSeq === undefined ? this.history.reconstruct(this.history.head(store.branchId)) : this.history.reconstruct({ branch_id: store.branchId,
      event_id: this.history.eventsOn(store.branchId).find(e => e.seq === atSeq)!.event_id, seq: atSeq });
    return conversationSnapshotSchema.parse({ taskId, agentId, cursor: state.cursor, seq: state.seq,
      nodes: [...state.nodes.values()], activeTurnId: history.in_flight_turns.find(t => t.agent_id === agentId)?.turn_id ?? null });
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
  async execute(raw: ConversationCommand): Promise<ConversationSnapshot> {
    if (this.closed) throw new ConversationError("unavailable", "The conversation service is closed.");
    const parsed = conversationCommandSchema.safeParse(raw);
    if (!parsed.success) throw new ConversationError("invalid_request", "Invalid conversation command.");
    const command = parsed.data;
    if (command.type === "read") return this.snapshot(command.taskId, command.agentId, command.atSeq);
    if (command.type === "cancel") {
      const snapshot = this.snapshot(command.taskId, command.agentId);
      this.runs.get(this.key(command.taskId, command.agentId))?.controller.abort();
      return snapshot;
    }
    if (command.type === "select") {
      this.ensureIdle(command.taskId, command.agentId);
      this.store(command.taskId, command.agentId).append({ type: "cursor.selected", nodeId: command.nodeId });
      return this.snapshot(command.taskId, command.agentId);
    }
    if (command.type !== "continue") { const prior = this.existing(command); if (prior) return prior; }
    const { snapshot: config } = await this.configuration.execute({ type: "read" });
    if (this.closed) throw new ConversationError("unavailable", "The conversation service is closed.");
    // 配置读取会让出执行权；提交事务前重新检查幂等身份和执行状态。
    if (command.type !== "continue") { const prior = this.existing(command); if (prior) return prior; }
    const resolved = resolveProviderModel(config, command.modelId);
    if (!resolved) throw new ConversationError("unavailable", "The model or provider is unavailable.");
    if (resolved.provider.auth === "api_key" && resolved.provider.credentialState !== "available") throw new ConversationError("unavailable", "Provider credentials are unavailable.");
    const { credentialState: _credentialState, ...provider } = resolved.provider;
    const settings: ModelSettings = { provider, model: resolved.model, thinking: command.thinking as ThinkingLevel | null };
    if (command.thinking && command.thinking !== "off" && !settings.model.capabilities.reasoning) throw new ConversationError("invalid_request", "This model does not support thinking.");
    const taskId = command.type === "start" ? randomUUID() : command.taskId;
    const agentId = command.type === "start" ? randomUUID() : command.agentId;
    let agent: AgentConfiguration;
    let messages: ModelItem[] = [];
    if (command.type === "start") {
      const selected = config.agents.find(a => a.id === command.agentConfigurationId && a.enabled);
      if (!selected) throw new ConversationError("not_found", "Agent configuration is unavailable.");
      agent = selected;
    } else {
      this.ensureIdle(taskId, agentId);
      const state = this.store(taskId, agentId).read();
      if (!state.agent) throw new ConversationError("not_found", "Conversation not found.");
      if (pathTo(state).some(n => !canContinue(n))) throw new ConversationError("conflict", "Select a complete history position before continuing.");
      agent = state.agent;
      messages = projectModel(state);
    }
    if (agent.maxCost !== null) throw new ConversationError("unavailable", "Cost limits require model pricing support, which is not available yet.");
    const branchId = command.type === "start" ? randomUUID() : this.task(taskId).branch_id;
    // 可判定的协议/配置错误在提交输入前返回；prepare 不访问网络或凭据。
    let credential: Promise<string | null> | undefined;
    const adapter = this.adapterFactory?.(settings) ?? new AiSdkAdapter(() => credential ??= this.configuration.executionCredential(provider.id, provider.revision));
    if (command.type !== "continue") messages.push({ kind: "input", text: command.text });
    try {
      adapter.prepare({ settings, system: agent.systemPrompt, messages,
        tools: settings.model.capabilities.tools ? this.tools(branchId).filter(t => allowedTool(agent, t.name)).map(({ name, description, parameters }) => ({ name, description, parameters })) : [] });
    } catch (error) {
      throw new ConversationError("invalid_request", error instanceof ModelFailure ? error.message : "The model request cannot be prepared.");
    }
    this.db.exec("BEGIN IMMEDIATE");
    let turnId: string;
    try {
      if (command.type === "start") {
        const title = command.text.slice(0, 72);
        this.history.append(branchId, { type: "task_created", payload: { task_id: taskId, title } });
        this.history.append(branchId, { type: "branch_created", payload: { task_id: taskId, branch_id: branchId } });
        this.db.prepare("INSERT INTO tasks (id, branch_id, title, created_at) VALUES (?, ?, ?, ?)").run(taskId, branchId, title, new Date().toISOString());
        this.history.append(branchId, { type: "agent_created", payload: { agent_id: agentId, title: agent.name } });
        this.store(taskId, agentId, false).append({ type: "created", agent });
      }
      const store = this.store(taskId, agentId, false);
      if (command.type !== "continue") {
        store.append({ type: "node.appended", node: { id: randomUUID(), parentId: store.read().cursor, kind: "input", text: command.text, createdAt: new Date().toISOString() } });
        this.db.prepare("INSERT INTO conversation_submissions (id, command_json, task_id, agent_id) VALUES (?, ?, ?, ?)")
          .run(command.submissionId, JSON.stringify(command), taskId, agentId);
      }
      if (store.read().cursor === null) throw new ConversationError("invalid_request", "A conversation needs input before it can continue.");
      turnId = this.history.startTurn(branchId, { agent_id: agentId, input: { nodeId: store.read().cursor } }).turn_id;
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    const store = this.store(taskId, agentId);
    const turn = this.history.reconstruct(this.history.head(branchId)).in_flight_turns.find(t => t.turn_id === turnId)!;
    const controller = new AbortController();
    const key = this.key(taskId, agentId);
    const timer = setTimeout(() => controller.abort(), (agent.timeout ?? 600) * 1000);
    // 凭据只在本轮内存中保留，不进入请求快照或 renderer。
    const done = Promise.resolve().then(() => runAgent({ store, adapter, settings, turn, signal: controller.signal, tools: this.tools(branchId) }))
      .catch(() => { console.error("Conversation execution could not be finalized."); })
      .finally(() => { clearTimeout(timer); this.runs.delete(key); this.notify(taskId, agentId); });
    this.runs.set(key, { controller, done });
    this.notify(taskId, agentId);
    return this.snapshot(taskId, agentId);
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
