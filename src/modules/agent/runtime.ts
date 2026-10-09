import { AiSdkAdapter } from "../../model/ai-sdk.ts";
import { ModelFailure } from "../../model/contract.ts";
import { composeSystemPrompt } from "../../model/system-prompt.ts";
import { runAgent, type RequestEnvironment } from "../../execution/loop.ts";
import { weftDeclarations } from "../../execution/weft.ts";
import { agentToolPolicy } from "../../execution/capabilities.ts";
import { implementResource, type ResourceController } from "../../resources/contract.ts";
import { projectForAgent } from "../../session/projection.ts";
import { SessionError } from "../../session/tree.ts";
import { resolveProviderModel, type ConfigurationSnapshot } from "../../shared/configuration.ts";
import { agentSelectionSchema, type AgentSelection, type ModelSettings } from "../../shared/model.ts";
import type { LiveBlock } from "../../shared/session.ts";
import type { RuntimeModuleFactory, RuntimeServices } from "../runtime-contract.ts";
import { Agent, AgentView, agentCommandSchema, agentCreateSchema } from "./contract.ts";

const selectionKey = "selection";
const submissionKey = (id: string) => `submission:${id}`;
type Stored = { selection: AgentSelection; revision: number };
interface Run { sessionId: string; agentId: string; controller: AbortController; done: Promise<void>; live: LiveBlock[] }

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

/** 代理控制器：每个代理对象独立运行，只检查自身状态；事件交错由会话树与投影处理。 */
class AgentController implements ResourceController {
  private runs = new Map<string, Run>();
  private closed = false;
  constructor(private readonly services: RuntimeServices) {}
  private key(sessionId: string, agentId: string) { return `${sessionId}:${agentId}`; }

  selection(agentId: string): Stored | null {
    const raw = this.services.state.get(agentId, selectionKey);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const value = raw as { selection: unknown; revision: unknown };
    return { selection: agentSelectionSchema.parse(value.selection), revision: Number(value.revision) };
  }
  private saveSelection(sessionId: string, agentId: string, selection: AgentSelection): void {
    const revision = (this.selection(agentId)?.revision ?? 0) + 1;
    this.services.state.set(sessionId, agentId, selectionKey, { selection, revision });
  }
  private async config(): Promise<ConfigurationSnapshot> {
    const { snapshot } = await this.services.configuration.execute({ type: "read" });
    if (this.closed) throw new SessionError("unavailable", "The agent runtime is closed.");
    return snapshot;
  }
  private environment(config: ConfigurationSnapshot, selection: AgentSelection): Pick<RequestEnvironment, "agent" | "settings" | "adapter"> {
    const agent = config.agents.find(a => a.id === selection.agentConfigurationId && a.enabled);
    if (!agent) throw new SessionError("unavailable", "Agent configuration is unavailable. Choose an available agent.");
    if (agent.maxCost !== null) throw new SessionError("unavailable", "Cost limits require model pricing support, which is not available yet.");
    const resolved = resolveProviderModel(config, selection.modelId);
    if (!resolved) throw new SessionError("unavailable", "The model or provider is unavailable.");
    if (resolved.provider.auth === "api_key" && resolved.provider.credentialState !== "available") throw new SessionError("unavailable", "Provider credentials are unavailable.");
    const { credentialState: _c, ...provider } = resolved.provider;
    const settings: ModelSettings = { provider, model: resolved.model, thinking: selection.thinking };
    let credential: Promise<string | null> | undefined;
    const adapter = this.services.adapterFactory?.(settings)
      ?? new AiSdkAdapter(() => credential ??= this.services.configuration.executionCredential(provider.id, provider.revision));
    return { agent, settings, adapter };
  }

  create(sessionId: string, objectId: string, input: unknown): { title: string } {
    const { selection } = agentCreateSchema.parse(input);
    const name = this.services.configuration.agentConfiguration(selection.agentConfigurationId)?.name ?? "Agent";
    this.saveSelection(sessionId, objectId, selection);
    return { title: name };
  }
  /** 创建前规整选择；首页与工作台添加共用。 */
  async prepareCreate(input: unknown): Promise<{ selection: AgentSelection }> {
    const { selection } = agentCreateSchema.parse(input);
    return { selection: normalizeSelection(await this.config(), selection) };
  }

  async execute({ sessionId, resource }: { sessionId: string; resource: { id: string } }, raw: unknown, before?: () => void): Promise<void> {
    const parsed = agentCommandSchema.safeParse(raw);
    if (!parsed.success) throw new SessionError("invalid_request", "Invalid agent command.");
    const command = parsed.data;
    const agentId = resource.id;
    const host = this.services.sessions;
    switch (command.type) {
      case "cancel": this.runs.get(this.key(sessionId, agentId))?.controller.abort(); return;
      case "configure": {
        const config = await this.config();
        host.commit(sessionId, () => {
          before?.();
          this.saveSelection(sessionId, agentId, normalizeSelection(config, command.selection, this.selection(agentId)?.selection));
        });
        return;
      }
      case "submit": case "continue": {
        if (command.type === "submit" && this.duplicate(agentId, command)) return;
        const config = await this.config();
        if (command.type === "submit" && this.duplicate(agentId, command)) return;
        // 只检查本代理；其他代理并行运行互不阻塞。
        if (this.runs.has(this.key(sessionId, agentId))) throw new SessionError("conflict", "This agent is running. Cancel or wait for it to finish.");
        let timeout = 600;
        host.commit(sessionId, timeline => {
          // before 可能刚创建本代理（首页组合入口），因此选择在其后读取。
          before?.();
          const current = this.selection(agentId);
          if (!current) throw new SessionError("not_found", "Agent not found.");
          const environment = this.environment(config, current.selection);
          timeout = environment.agent.timeout ?? 600;
          const path = timeline.continuation();
          if (!path.some(n => n.kind === "event" && n.type === "resource_created" && (n.data as { id?: unknown }).id === agentId)) {
            throw new SessionError("not_found", "Agent not found on the current session path.");
          }
          const messages = projectForAgent(path, agentId);
          if (command.type === "submit") messages.push({ kind: "input", text: command.text });
          try {
            environment.adapter.prepare({ settings: environment.settings, system: composeSystemPrompt(environment.agent), messages,
              tools: environment.settings.model.capabilities.tools ? weftDeclarations() : [] });
          } catch (error) {
            throw new SessionError("invalid_request", error instanceof ModelFailure ? error.message : "The model request cannot be prepared.");
          }
          if (command.type === "submit") {
            timeline.append({ kind: "message", agentId, text: command.text });
            this.services.state.set(sessionId, agentId, submissionKey(command.submissionId), JSON.stringify(command));
          }
        });
        this.launch(sessionId, agentId, timeout);
        return;
      }
    }
  }
  private duplicate(agentId: string, command: { submissionId: string }): boolean {
    const prior = this.services.state.get(agentId, submissionKey(command.submissionId));
    if (prior === null) return false;
    if (prior !== JSON.stringify(command)) throw new SessionError("conflict", "This submission ID was already used for different input.");
    return true;
  }

  private launch(sessionId: string, agentId: string, timeout: number): void {
    const host = this.services.sessions;
    const controller = new AbortController();
    const key = this.key(sessionId, agentId);
    const timer = setTimeout(() => controller.abort(), timeout * 1000);
    let progressTimer: ReturnType<typeof setTimeout> | undefined;
    const done = Promise.resolve().then(() => runAgent({ agentId,
      signal: controller.signal,
      append: node => host.commit(sessionId, timeline => timeline.append(node)),
      complete: (blockId, completion) => host.commit(sessionId, timeline => timeline.completeBlock(blockId, completion)),
      progress: blocks => {
        const run = this.runs.get(key);
        if (run) run.live = blocks;
        progressTimer ??= setTimeout(() => { progressTimer = undefined; host.progressChanged(sessionId); }, 32);
      },
      environment: async () => {
        const config = await this.config();
        const current = this.selection(agentId);
        if (!current) throw new SessionError("not_found", "Agent not found.");
        // 消息、资源和策略取自同一请求边界；期间事件由投影排在本响应之后。
        const path = host.path(sessionId);
        const environment = this.environment(config, current.selection);
        const linked = host.linked(path, agentId);
        return { ...environment, messages: projectForAgent(path, agentId), requestParentId: path.at(-1)?.id ?? null,
          capabilities: host.capabilities(linked, agentToolPolicy(environment.agent)),
          context: await host.context(linked) };
      } }))
      .catch(() => { console.error("Agent execution could not be finalized."); })
      .finally(() => { clearTimeout(timer); clearTimeout(progressTimer); this.runs.delete(key); host.progressChanged(sessionId); });
    this.runs.set(key, { sessionId, agentId, controller, done, live: [] });
    host.progressChanged(sessionId);
  }

  activity(sessionId: string): { running: string[]; live: LiveBlock[] } {
    const runs = [...this.runs.values()].filter(run => run.sessionId === sessionId);
    return { running: runs.map(run => run.agentId), live: runs.flatMap(run => run.live) };
  }
  linkTools(_sessionId: string, objectId: string, resource: Parameters<NonNullable<ResourceController["linkTools"]>>[2]) {
    const current = this.selection(objectId);
    const agent = current && this.services.configuration.agentConfiguration(current.selection.agentConfigurationId);
    return agent ? this.services.sessions.capabilities([resource], agentToolPolicy(agent)).describe(resource.id) : [];
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const run of this.runs.values()) run.controller.abort();
    await Promise.allSettled([...this.runs.values()].map(run => run.done));
  }
}

export default ((services: RuntimeServices) => {
  const controller = new AgentController(services);
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
}) satisfies RuntimeModuleFactory;
