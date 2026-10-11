import { createContext, createElement, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { RendererObjectContext } from "@atelier/sdk/renderer";
import { pluginOf } from "@atelier/sdk/contracts";
import type { WorkbenchObject } from "../../shared/workbench";
import { ModelConfiguration, ThinkingPreferences } from "../../modules/agent/configuration";
import { sessionSnapshot } from "../../plugins/records";
import { sessionPath } from "../../shared/session-path";
import { useWorkbench } from "../features/workbench/context";
import { useSession, useSessionProgress } from "../features/session/state";
import { objectSubmission } from "../features/session/registry";
import { useConfiguration } from "../features/configuration/state";
import { useAppearance } from "../features/appearance/state";
import { resolveToolView, toolPreparation } from "../features/conversation/tool-views";
import { useModuleViews } from "./views";

const Catalogs = createContext<RendererObjectContext["catalogs"] | null>(null);
export function RendererCatalogProvider({ ready, children }: { ready: boolean; children: ReactNode }) {
  const configuration = useConfiguration(ready);
  const appearance = useAppearance();
  const value = useMemo<RendererObjectContext["catalogs"]>(() => ({
    error: configuration.error,
    get(contract) {
      const raw = contract.id === ModelConfiguration.id && contract.version === ModelConfiguration.version ? configuration.snapshot
        : contract.id === ThinkingPreferences.id && contract.version === ThinkingPreferences.version
          ? { thinkingAutoExpand: appearance.thinkingAutoExpand, thinkingAutoCollapse: appearance.thinkingAutoCollapse } : null;
      const parsed = contract.schema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
  }), [configuration.error, configuration.snapshot, appearance.thinkingAutoExpand, appearance.thinkingAutoCollapse]);
  return createElement(Catalogs.Provider, { value }, children);
}

/** 宿主把协调后的会话视图和对象能力交给 SDK 卡片，不暴露控制器或物理节点。 */
export function useObjectContext(object: WorkbenchObject): RendererObjectContext {
  const workbench = useWorkbench();
  const { controller } = workbench;
  const { state, snapshot, historical } = useSession(controller);
  const progress = useSessionProgress(controller);
  const catalogs = useContext(Catalogs);
  if (!catalogs) throw new Error("Renderer catalogs must be provided by the workbench.");
  const registry = useModuleViews();
  const records = useMemo(() => snapshot
    ? sessionSnapshot(snapshot.sessionId, snapshot.title, snapshot.nodes, sessionPath(snapshot.nodes, snapshot.at), false) : null, [snapshot]);
  const blocks = useMemo(() => historical ? [] : progress.live.filter(block => block.agentId === object.id), [historical, progress.live, object.id]);
  const onStream = useCallback<RendererObjectContext["onStream"]>((channel, listener) =>
    window.host.onObjectStream(controller.sessionId, object.id, (name, data) => {
      if (name === `${pluginOf(object.kind)}/${channel}`) listener(data);
    }), [controller.sessionId, object.id, object.kind]);
  return {
    ref: { sessionId: controller.sessionId, id: object.id, kind: object.kind },
    view: { ready: workbench.ready, busy: state.busy, historical, status: state.status, error: state.error, missing: state.missing },
    session: {
      snapshot: () => records, subscribe: controller.subscribe,
      create: (kind, input, position) => controller.executeAndRead({ type: "resource.create", sessionId: controller.sessionId, kind, input, position }),
      refresh: controller.refresh, followLive: controller.followCursor,
    },
    invoke: command => controller.execute({ type: "resource.command", sessionId: controller.sessionId, objectId: object.id, command }),
    onStream,
    activity: {
      running: progress.unsettledObjectIds.includes(object.id),
      blocks,
    },
    catalogs,
    tools: { resolve: props => resolveToolView(props, registry), preparation: toolPreparation },
    draft: { value: workbench.draft(object.id), set: value => workbench.onDraftChange(object.id, value) },
    submissions: objectSubmission(controller.sessionId, object.id),
    home: workbench.onHome,
  };
}
