import { PluginApiError, type ModelServices, type ResourceRef } from "@asterism-app/sdk/runtime";
import type { RunGroup } from "../lifecycle.ts";
import type { PluginHostServices } from "../loader.ts";
import type { BoundTopLevelTool } from "../top-level-tools.ts";
import type { LiveBlock } from "../../shared/session.ts";
import { inputReferences } from "../../model/input.ts";
import type { SdkObjects } from "./objects.ts";

interface ModelBindingOptions {
  owner: string;
  host: PluginHostServices;
  modelRuns: RunGroup;
  objects: Pick<SdkObjects, "own" | "checkRef">;
  checkAvailable(): void;
  topLevelTools(ref: ResourceRef, policy: (name: string) => boolean, linked: readonly ResourceRef[]): BoundTopLevelTool[];
}
/** Capture model request authority and track live output independently of object storage operations. */
export function bindModels({ owner, host, modelRuns, objects: { own, checkRef }, checkAvailable, topLevelTools }: ModelBindingOptions) {
  const running = new Map<string, { sessionId: string; live: LiveBlock[] }>();
  const models: ModelServices = {
    validate: (request, options) => {
      checkAvailable();
      return modelRuns.start(signal => host.models.validate({ ...request, signal }, {
        content: messages => host.content?.captureReader(inputReferences(messages), options?.content, owner),
      }), { signal: request.signal, affectsHistory: false }).done;
    },
    stream: (request, options) => {
      checkAvailable();
      return modelRuns.iterate(signal => host.models.stream({ ...request, signal }, {
        content: messages => host.content?.captureReader(inputReferences(messages), options?.content, owner),
      }), request.signal);
    },
    run(request) {
      if (modelRuns.closed) throw new PluginApiError("unavailable", "The plugin is closing.");
      const ref = Object.freeze({ ...request.object });
      own(ref.kind); checkRef(ref);
      if (running.has(ref.id)) throw new PluginApiError("unavailable", "A model request is already running on this resource.");
      const path = host.sessions.timeline(ref.sessionId);
      const executing = host.sessions.workbench(ref.sessionId).objects.find(object => object.id === ref.id);
      if (!executing)
        throw new PluginApiError("unavailable", "The resource is not on the current session path.");
      if ((path.at(-1)?.id ?? null) !== request.requestParentId)
        throw new PluginApiError("invalid_argument", "Rebuild model input from the current session position.");
      const system = typeof request.system === "function" ? request.system : structuredClone(request.system);
      const { target, messages, tools, cache, userAgent } = structuredClone({
        target: request.target, messages: request.messages, tools: request.tools, cache: request.cache,
        userAgent: request.userAgent,
      });
      const allowed = tools?.allow ? new Set(tools.allow) : null;
      const excluded = new Set(tools?.exclude ?? []);
      const linked = host.sessions.linked(ref.sessionId, ref.id);
      const policy = (name: string) => (allowed === null || allowed.has(name)) && !excluded.has(name);
      const capabilities = host.sessions.capabilities(linked, policy, { ref, title: executing.title });
      const boundTools = topLevelTools(ref, policy, linked.map(resource => ({ sessionId: ref.sessionId, id: resource.id, kind: resource.kind })));
      let progressTimer: ReturnType<typeof setTimeout> | undefined;
      const receive = request.observer.event.bind(request.observer);
      const work = modelRuns.start(signal => host.models.run({ plugin: owner, object: ref, target, system, messages, tools, cache, userAgent, requestParentId: request.requestParentId,
        signal, capabilities, topLevelTools: boundTools, context: host.sessions.context(linked),
        completionExtensions: request.completionExtensions,
        content: messages => host.content?.capture(inputReferences(messages), { owner, sessionId: ref.sessionId,
          objectId: ref.id, recordIds: new Set(path.map(node => node.id)), check: checkAvailable }),
        handover: () => host.content?.handover(ref.sessionId, ref.id),
        observer: { event(event) {
          if (event.type === "progress") {
            const run = running.get(ref.id);
            if (run) run.live = event.blocks.map(block => ({ ...structuredClone(block), objectId: ref.id }));
            progressTimer ??= setTimeout(() => { progressTimer = undefined; host.sessions.progressChanged(ref.sessionId); }, 32);
          }
          return receive(event);
        } },
      }), { object: ref, signal: request.signal });
      const done = work.done.finally(() => { clearTimeout(progressTimer); running.delete(ref.id); host.sessions.progressChanged(ref.sessionId); });
      running.set(ref.id, { sessionId: ref.sessionId, live: [] });
      host.sessions.progressChanged(ref.sessionId);
      return done;
    },
    list: () => { checkAvailable(); return host.models.list(); },
  };
  return {
    models,
    activity: (sessionId: string) => {
      const active = [...running].filter(([, run]) => run.sessionId === sessionId);
      return { running: active.map(([id]) => id), live: active.flatMap(([, run]) => run.live) };
    },
  };
}
