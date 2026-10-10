import { ModelFailure } from "../../model/contract.ts";
import { composeSystemPrompt } from "../../model/system-prompt.ts";
import { coreDeclarations } from "../../execution/core.ts";
import { agentToolPolicy } from "../../execution/capabilities.ts";
import { implementResource, type ResourceController } from "../../resources/contract.ts";
import { projectForAgent } from "../../session/projection.ts";
import { SessionError } from "../../session/tree.ts";
import { agentSelectionSchema, type AgentSelection } from "../../shared/model.ts";
import type { LiveBlock } from "../../shared/session.ts";
import { defineModule, type PluginContext } from "../../plugins/contract.ts";
import { ModelTargetFailure, type ModelTarget, type RegistryView } from "../../plugins/models.ts";
import { Agent, AgentView, agentCommandSchema, agentCreateSchema } from "./contract.ts";

const selectionKey = "selection";
const submissionKey = (id: string) => `submission:${id}`;
type Stored = { selection: AgentSelection; revision: number };
interface Run { sessionId: string; agentId: string; controller: AbortController; done: Promise<void>; live: LiveBlock[] }

type RegistryAgent = ReturnType<RegistryView["agents"]>[number];
/** 校验并规整选择；已失效的另一项可暂时保留以便逐项修复，执行前仍完整校验。 */
export function normalizeSelection(registry: RegistryView, selection: AgentSelection, previous?: AgentSelection): AgentSelection {
  if (!registry.agents().some(agent => agent.id === selection.agent) && selection.agent !== previous?.agent) {
    throw new SessionError("unavailable", "The selected agent configuration is unavailable.");
  }
  const model = registry.models().find(item => item.model === selection.model);
  if (!model) {
    if (selection.model !== previous?.model) throw new SessionError("unavailable", "The selected model is unavailable.");
    return selection;
  }
  return model.capabilities.reasoning ? selection : { ...selection, thinking: "off" };
}
/** 代理选择即模型目标：角色来自代理配置，选择作为覆盖。 */
function targetOf(agent: RegistryAgent, selection: AgentSelection): ModelTarget {
  return { role: agent.role ?? "default", model: selection.model, thinking: selection.thinking ?? undefined };
}

/** 代理控制器：每个代理对象独立运行，只检查自身状态；事件交错由会话树与投影处理。 */
class AgentController implements ResourceController {
  private runs = new Map<string, Run>();
  private closed = false;
  constructor(private readonly plugin: PluginContext) {}
  private key(sessionId: string, agentId: string) { return `${sessionId}:${agentId}`; }

  selection(agentId: string): Stored | null {
    const raw = this.plugin.state.get(agentId, selectionKey);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const value = raw as { selection: unknown; revision: unknown };
    return { selection: agentSelectionSchema.parse(value.selection), revision: Number(value.revision) };
  }
  private saveSelection(sessionId: string, agentId: string, selection: AgentSelection): void {
    const revision = (this.selection(agentId)?.revision ?? 0) + 1;
    this.plugin.state.set(sessionId, agentId, selectionKey, { selection, revision });
  }
  private agent(selection: AgentSelection): RegistryAgent {
    if (this.closed) throw new SessionError("unavailable", "The agent runtime is closed.");
    const agent = this.plugin.registry.agents().find(item => item.id === selection.agent);
    if (!agent) throw new SessionError("unavailable", "Agent configuration is unavailable. Choose an available agent.");
    return agent;
  }

  create(sessionId: string, objectId: string, input: unknown): { title: string } {
    const { selection, title } = agentCreateSchema.parse(input);
    const name = title ?? this.plugin.registry.agents().find(agent => agent.id === selection.agent)?.name ?? "Agent";
    this.saveSelection(sessionId, objectId, selection);
    return { title: name };
  }
  /** 创建前规整选择；首页与工作台添加共用。 */
  async prepareCreate(input: unknown): Promise<{ selection: AgentSelection; title?: string }> {
    const { selection, title } = agentCreateSchema.parse(input);
    return { selection: normalizeSelection(this.plugin.registry, selection), ...(title ? { title } : {}) };
  }

  async execute({ sessionId, resource }: { sessionId: string; resource: { id: string } }, raw: unknown, before?: () => void): Promise<void> {
    const parsed = agentCommandSchema.safeParse(raw);
    if (!parsed.success) throw new SessionError("invalid_request", "Invalid agent command.");
    const command = parsed.data;
    const agentId = resource.id;
    const host = this.plugin.session(sessionId);
    switch (command.type) {
      case "cancel": this.runs.get(this.key(sessionId, agentId))?.controller.abort(); return;
      case "configure": {
        host.commit(() => {
          before?.();
          this.saveSelection(sessionId, agentId, normalizeSelection(this.plugin.registry, command.selection, this.selection(agentId)?.selection));
        });
        return;
      }
      case "submit": case "continue": {
        if (command.type === "submit" && this.duplicate(agentId, command)) return;
        // 校验目标只在事务外异步取凭据状态；选择在事务内读取。
        const selected = this.selection(agentId);
        const resolved = selected ? await this.plugin.models.resolve(targetOf(this.agent(selected.selection), selected.selection))
          .catch(error => { if (error instanceof ModelTargetFailure) throw new SessionError("unavailable", error.message); throw error; }) : null;
        if (command.type === "submit" && this.duplicate(agentId, command)) return;
        // 只检查本代理；其他代理并行运行互不阻塞。
        if (this.runs.has(this.key(sessionId, agentId))) throw new SessionError("conflict", "This agent is running. Cancel or wait for it to finish.");
        let timeout = 600;
        host.commit(timeline => {
          // before 可能刚创建本代理（首页组合入口），因此选择在其后读取。
          before?.();
          const current = this.selection(agentId);
          if (!current) throw new SessionError("not_found", "Agent not found.");
          const agent = this.agent(current.selection);
          timeout = agent.timeout ?? 600;
          const path = timeline.continuation();
          if (!path.some(n => n.kind === "event" && n.type === "resource_created" && (n.data as { id?: unknown }).id === agentId)) {
            throw new SessionError("not_found", "Agent not found on the current session path.");
          }
          const messages = projectForAgent(path, agentId);
          if (command.type === "submit") messages.push({ kind: "input", text: command.text });
          // 首页组合入口在 before 中才创建本代理：创建前已规整选择，预检交给首次请求。
          if (resolved) try {
            resolved.adapter.prepare({ settings: resolved.settings, system: composeSystemPrompt(agent), messages,
              tools: resolved.settings.model.capabilities.tools ? coreDeclarations() : [] });
          } catch (error) {
            throw new SessionError("invalid_request", error instanceof ModelFailure ? error.message : "The model request cannot be prepared.");
          }
          if (command.type === "submit") {
            timeline.append({ kind: "message", agentId, text: command.text });
            this.plugin.state.set(sessionId, agentId, submissionKey(command.submissionId), JSON.stringify(command));
          }
        });
        this.launch(sessionId, agentId, timeout);
        return;
      }
    }
  }
  private duplicate(agentId: string, command: { submissionId: string }): boolean {
    const prior = this.plugin.state.get(agentId, submissionKey(command.submissionId));
    if (prior === null) return false;
    if (prior !== JSON.stringify(command)) throw new SessionError("conflict", "This submission ID was already used for different input.");
    return true;
  }

  private launch(sessionId: string, agentId: string, timeout: number): void {
    const host = this.plugin.session(sessionId);
    const controller = new AbortController();
    const key = this.key(sessionId, agentId);
    const timer = setTimeout(() => controller.abort(), timeout * 1000);
    let progressTimer: ReturnType<typeof setTimeout> | undefined;
    const done = Promise.resolve().then(() => this.plugin.models.run({ agentId,
      signal: controller.signal,
      append: node => host.commit(timeline => timeline.append(node)),
      complete: (blockId, completion) => host.commit(timeline => timeline.completeBlock(blockId, completion)),
      progress: blocks => {
        const run = this.runs.get(key);
        if (run) run.live = blocks;
        progressTimer ??= setTimeout(() => { progressTimer = undefined; host.progressChanged(); }, 32);
      },
      environment: async () => {
        const current = this.selection(agentId);
        if (!current) throw new SessionError("not_found", "Agent not found.");
        // 消息、资源和策略取自同一请求边界；期间事件由投影排在本响应之后。
        const agent = this.agent(current.selection);
        const path = host.path();
        const linked = host.linked(agentId);
        return { target: targetOf(agent, current.selection), prompt: agent, maxTurns: agent.maxTurns,
          messages: projectForAgent(path, agentId), requestParentId: path.at(-1)?.id ?? null,
          capabilities: host.capabilities(linked, agentToolPolicy(agent)), context: await host.context(linked) };
      } }))
      .catch(() => { console.error("Agent execution could not be finalized."); })
      .finally(() => { clearTimeout(timer); clearTimeout(progressTimer); this.runs.delete(key); host.progressChanged(); });
    this.runs.set(key, { sessionId, agentId, controller, done, live: [] });
    host.progressChanged();
  }

  activity(sessionId: string): { running: string[]; live: LiveBlock[] } {
    const runs = [...this.runs.values()].filter(run => run.sessionId === sessionId);
    return { running: runs.map(run => run.agentId), live: runs.flatMap(run => run.live) };
  }
  linkTools(sessionId: string, objectId: string, resource: Parameters<NonNullable<ResourceController["linkTools"]>>[2]) {
    const current = this.selection(objectId);
    const agent = current && this.plugin.registry.agents().find(item => item.id === current.selection.agent);
    return agent ? this.plugin.session(sessionId).capabilities([resource], agentToolPolicy(agent)).describe(resource.id) : [];
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const run of this.runs.values()) run.controller.abort();
    await Promise.allSettled([...this.runs.values()].map(run => run.done));
  }
}

export default defineModule(plugin => {
  const controller = new AgentController(plugin);
  return {
    resources: [implementResource(Agent, AgentView, {
      project: (_state, resource) => {
        const current = controller.selection(resource.id);
        return { agentId: resource.id, selection: current?.selection ?? null, selectionRevision: current?.revision ?? 0 };
      },
      async inspect(_state, resource) { return { type: Agent.kind, title: resource.title }; },
      controller,
    })],
    tools: [],
  };
});
