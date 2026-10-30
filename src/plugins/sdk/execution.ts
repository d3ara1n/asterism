import { PluginApiError, type ExecutionServices, type ResourceRef } from "@asterism-app/sdk/runtime";
import type { RunGroup } from "../lifecycle.ts";
import type { PluginHostServices } from "../loader.ts";
import type { BoundTopLevelTool } from "../top-level-tools.ts";
import type { LiveBlock } from "../../shared/session.ts";
import { inputReferences } from "../../model/input.ts";
import type { SdkObjects } from "./objects.ts";
import { bindModelTools } from "../../execution/core.ts";
import type { ContentLease } from "../../runtime/content-store.ts";

interface ExecutionBinding {
  owner: string;
  host: PluginHostServices;
  runs: RunGroup;
  objects: Pick<SdkObjects, "own" | "checkRef">;
  checkAvailable(): void;
  topLevelTools(ref: ResourceRef, policy: (name: string) => boolean, linked: readonly ResourceRef[], interactive: boolean): BoundTopLevelTool[];
}

/** Resource access, request holds, content handoff, and optional presentation surround the generic runner. */
export function bindExecution({ owner, host, runs, objects: { own, checkRef }, checkAvailable, topLevelTools }: ExecutionBinding) {
  const live = new Map<symbol, { ref: ResourceRef; blocks: LiveBlock[] }>();
  const execution: ExecutionServices = {
    async withProgress(resource, work) {
      checkAvailable(); own(resource.kind); checkRef(resource);
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
      checkAvailable();
      if (runs.closed) throw new PluginApiError("unavailable", "The execution service is closing.");
      const ref = Object.freeze({ ...request.access });
      own(ref.kind); checkRef(ref); request.signal.throwIfAborted();
      const source = host.sessions.workbench(ref.sessionId).objects.find(object => object.id === ref.id);
      if (!source) throw new PluginApiError("unavailable", "The access owner is not on the current session path.");
      const contentAccess = { owner, sessionId: ref.sessionId, objectId: ref.id,
        recordIds: new Set(host.sessions.timeline(ref.sessionId).map(node => node.id)), check: checkAvailable };
      const linked = host.sessions.linked(ref.sessionId, ref.id);
      const linkedRefs = linked.map(resource => ({ sessionId: ref.sessionId, id: resource.id, kind: resource.kind }));
      const policyConfig = structuredClone(request.tools);
      const allowed = policyConfig?.allow ? new Set(policyConfig.allow) : null;
      const excluded = new Set(policyConfig?.exclude ?? []);
      const policy = (name: string) => (allowed === null || allowed.has(name)) && !excluded.has(name);
      const interactive = request.interactive;
      const { target, messages, cache, userAgent, requestParentId } = structuredClone({
        target: request.target, messages: request.messages, cache: request.cache, userAgent: request.userAgent, requestParentId: request.requestParentId,
      });
      const system = typeof request.system === "function" ? request.system : structuredClone(request.system);
      const release = host.holds.acquire(ref, linkedRefs);
      const work = runs.start(async signal => {
        let handover: ContentLease | undefined;
        try {
          handover = host.content?.handover(ref.sessionId, ref.id);
          const capabilities = host.sessions.capabilities(linked, policy, { ref, title: source.title }, interactive);
          const boundTools = topLevelTools(ref, policy, linkedRefs, interactive);
          const preparedSystem = host.sessions.context(linked).then(files => typeof system === "function" ? system(files) : system);
          return await host.models.run({ target, system: preparedSystem,
            messages, cache, userAgent, sessionId: ref.sessionId, requestParentId,
            signal, tools: bindModelTools(capabilities, boundTools, handover),
            completionExtensions: request.completionExtensions,
            content: values => options?.content
              ? host.content?.captureReader(inputReferences(values), options.content, owner)
              : host.content?.capture(inputReferences(values), contentAccess),
            observer: { event(event) {
              if (event.type === "block" && event.block.kind === "toolcall" && event.block.outcome && options?.output && handover && host.content)
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
