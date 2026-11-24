import { formatModelExpression, ResourceNoticeRaised } from "@asterism-app/sdk/contracts";
import { PluginApiError, type ExecutionServices, type ResourceRef, type ToolCaller } from "@asterism-app/sdk/runtime";
import type { RunGroup } from "../lifecycle.ts";
import type { PluginHostServices } from "../loader.ts";
import type { BoundTopLevelTool } from "../top-level-tools.ts";
import type { LiveBlock } from "../../shared/session.ts";
import { inputReferences } from "../../model/input.ts";
import type { SdkObjects } from "./objects.ts";
import { bindModelTools } from "../../execution/core.ts";
import type { ContentLease } from "../../runtime/content-store.ts";
import type { PluginEventScope } from "../event-scope.ts";
import type { ToolUsageRecord } from "../../telemetry/types.ts";
import { declaredSubjects } from "../../telemetry/subjects.ts";

interface ExecutionBinding {
  owner: string;
  host: PluginHostServices;
  events: Pick<PluginEventScope, "publish">;
  runs: RunGroup;
  objects: Pick<SdkObjects, "own" | "checkRef">;
  checkAvailable(): void;
  topLevelTools(caller: ToolCaller, policy: (name: string) => boolean, linked: readonly ResourceRef[], interactive: boolean, resourceToolRestriction: (kind: string) => string | null): BoundTopLevelTool[];
}

/** Resource access, request holds, content handoff, and optional presentation surround the generic runner. */
export function bindExecution({ owner, host, events, runs, objects: { own, checkRef }, checkAvailable, topLevelTools }: ExecutionBinding) {
  const live = new Map<symbol, { ref: ResourceRef; blocks: LiveBlock[] }>();
  const bindOwner = (resource: ResourceRef) => {
    own(resource.kind); checkRef(resource);
    const ref = Object.freeze({ ...resource });
    const source = host.sessions.workbench(ref.sessionId).objects.find(object => object.id === ref.id);
    if (!source) throw new PluginApiError("unavailable", "The execution owner is not on the current session path.");
    return { ref, source };
  };
  const execution: ExecutionServices = {
    openInstanceActivity(resource) {
      const { ref, source } = bindOwner(resource);
      return host.shared.activities.openInstance(ref, source.title);
    },
    withActivity(resource, work, options) {
      const { ref, source } = bindOwner(resource);
      return runs.start(async signal => {
        signal.throwIfAborted();
        const activity = host.shared.activities.begin(ref, source.title);
        try { return await work({ signal, progress: activity.progress }); }
        finally { activity.close(); }
      }, { object: ref, signal: options?.signal, affectsHistory: false }).done;
    },
    async withProgress(resource, work) {
      own(resource.kind); checkRef(resource);
      const ref = { ...resource }, key = Symbol();
      let timer: ReturnType<typeof setTimeout> | undefined;
      live.set(key, { ref, blocks: [] });
      try {
        return await work({ event(event) {
          if (event.type !== "progress") return;
          live.get(key)!.blocks = event.blocks.map(block => ({ ...structuredClone(block), objectId: ref.id }));
          timer ??= setTimeout(() => { timer = undefined; host.sessions.progressChanged(ref.sessionId); }, 32);
        } });
      } finally {
        clearTimeout(timer); live.delete(key);
        host.sessions.progressChanged(ref.sessionId);
      }
    },
    run(request, options) {
      if (runs.closed) throw new PluginApiError("unavailable", "The execution service is closing.");
      const { ref, source } = bindOwner(request.access);
      request.signal.throwIfAborted();
      const contentAccess = { owner, sessionId: ref.sessionId, objectId: ref.id,
        recordIds: new Set(host.sessions.view(ref.sessionId).timelineIds()), check: checkAvailable };
      const linked = host.sessions.linked(ref.sessionId, ref.id);
      const linkedRefs = linked.map(resource => ({ sessionId: ref.sessionId, id: resource.id, kind: resource.kind }));
      const policyConfig = structuredClone(request.tools);
      const allowed = policyConfig?.allow ? new Set(policyConfig.allow) : null;
      const excluded = new Set(policyConfig?.exclude ?? []);
      const policy = (name: string) => (allowed === null || allowed.has(name)) && !excluded.has(name);
      const allowedResources = request.resources?.allow ? new Set(request.resources.allow) : null;
      const excludedResources = new Set(request.resources?.exclude ?? []);
      const resourcePolicy = (kind: string) => (allowedResources === null || allowedResources.has(kind)) && !excludedResources.has(kind);
      const interactive = request.interactive;
      const { target, messages, userAgent, requestParentId, purpose } = structuredClone({
        target: request.target, messages: request.messages, userAgent: request.userAgent, requestParentId: request.requestParentId, purpose: request.purpose,
      });
      const inputModalities = host.models.list().find(model => model.model === formatModelExpression(target))?.capabilities.inputModalities;
      const caller: ToolCaller = Object.freeze({ ref, title: source.title, ...(request.agent === undefined ? {} : { agent: request.agent }),
        modelInputModalities: Object.freeze([...(inputModalities ?? [])]) });
      const usage = request.usage;
      const subjects = typeof usage === "function" ? [] : declaredSubjects(usage, owner);
      const system = typeof request.system === "function" ? request.system : structuredClone(request.system);
      const release = host.holds.acquire(ref, linkedRefs);
      const work = runs.start(async signal => {
        let handover: ContentLease | undefined;
        try {
          handover = host.content?.handover(ref.sessionId, ref.id);
          const capabilities = host.sessions.capabilities(linked, policy, caller, interactive, resourcePolicy);
          const boundTools = topLevelTools(caller, policy, linkedRefs, interactive, kind => capabilities.resourceToolRestriction(kind));
          const preparedSystem = host.sessions.context(linked).then(files => {
            const prepared = typeof system === "function" ? system(files) : system;
            if (typeof usage === "function") subjects.push(...declaredSubjects(usage, owner));
            return prepared;
          });
          const settledTools: ToolUsageRecord[] = [];
          return await host.models.run({ target, system: preparedSystem,
            messages, userAgent, sessionId: ref.sessionId, requestParentId,
            telemetry: { pluginId: owner, purposeId: purpose ?? null, subjects, tools: settledTools },
            signal, tools: bindModelTools(capabilities, boundTools, handover, () => {
              events.publish(ResourceNoticeRaised, { title: source.title, kind: "attention" }, { plugin: owner, resource: ref });
            }, settled => settledTools.push(settled)),
            completionExtensions: request.completionExtensions,
            content: values => options?.content
              ? host.content?.captureReader(inputReferences(values), options.content, owner)
              : host.content?.capture(inputReferences(values), contentAccess),
            observer: { event(event) {
              if ((event.type === "block" || event.type === "tool.complete") && event.block.kind === "toolcall" && event.block.outcome && options?.output && handover && host.content)
                options.output.retain(event.block.outcome, host.content.reader({ ...contentAccess, scope: handover }));
              return request.observer.event(event);
            } },
          });
        } finally {
          try { await handover?.close(); }
          finally { release(); }
        }
      }, { object: ref, signal: request.signal, affectsHistory: false });
      return work.done;
    },
  };
  return { execution, activity: (sessionId: string) => ({
    live: [...live.values()].filter(run => run.ref.sessionId === sessionId).flatMap(run => run.blocks),
  }) };
}
