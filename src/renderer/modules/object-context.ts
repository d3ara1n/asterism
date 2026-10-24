import { createElement, useCallback, useMemo, type ReactNode } from "react";
import { RendererCatalogsProvider, RendererModelsProvider, RendererPreferencesProvider, RendererToolsProvider, type RendererCatalogs, type RendererObjectContext } from "@atelier/sdk/renderer";
import { pluginOf, resourceCall, reference } from "@atelier/sdk/contracts";
import type { WorkbenchObject } from "../../shared/workbench";
import { ModelConfiguration } from "@atelier/builtin-api/contracts";
import { sessionSnapshot } from "../../plugins/records";
import { nodeView } from "../../session/view";
import { useWorkbench } from "../features/workbench/context";
import { useObjectLive, useSession } from "../features/session/state";
import { useConfiguration } from "../features/configuration/state";
import { resolveToolView, toolPreparation } from "../features/conversation/tool-views";
import { useModuleViews } from "./views";
import { pluginPreferences } from "../features/creation/preferences";
import { contentInput, contentReader, contentCommand } from "../features/creation/content";
import { objectRetention } from "../features/session/retention";
import { channels } from "../runtime";

export function RendererCatalogProvider({ ready, children }: { ready: boolean; children: ReactNode }) {
  const configuration = useConfiguration(ready);
  const value = useMemo<RendererCatalogs>(() => ({
    error: configuration.readError,
    get(contract) {
      const raw = Object.is(contract, ModelConfiguration) ? configuration.snapshot : null;
      const parsed = contract.schema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
  }), [configuration.readError, configuration.snapshot]);
  return createElement(RendererCatalogsProvider, { value }, children);
}

/** 宿主把协调后的会话视图和对象能力交给 SDK 卡片，不暴露控制器或物理节点。 */
export function useObjectContext(object: WorkbenchObject): RendererObjectContext {
  const workbench = useWorkbench();
  const { controller } = workbench;
  const { state, snapshot } = useSession(controller);
  const records = useMemo(() => snapshot
    ? sessionSnapshot(nodeView(snapshot.sessionId, snapshot.title, snapshot.nodes, snapshot.cursor)) : null,
  [snapshot?.sessionId, snapshot?.title, snapshot?.nodes, snapshot?.cursor]);
  const openChannel = useCallback<RendererObjectContext["openChannel"]>(contract =>
    channels.open(contract, { sessionId: controller.sessionId, id: object.id, kind: object.kind }), [controller.sessionId, object.id, object.kind]);
  const content = useMemo(() => contentReader(() => ({ sessionId: controller.sessionId, objectId: object.id })),
    [controller.sessionId, object.id]);
  const retained = useMemo(() => objectRetention.object(controller.sessionId, object.id), [controller.sessionId, object.id]);
  return {
    ref: { sessionId: controller.sessionId, id: object.id, kind: object.kind },
    content,
    input: contract => contentInput({ sessionId: controller.sessionId, resourceKind: contract.resource.kind, contractId: contract.id,
      ...(contract.kind === "action" ? { objectId: object.id } : {}) }),
    view: { ready: workbench.ready, error: state.readError, missing: state.missing },
    session: {
      snapshot: () => records, subscribe: controller.subscribe,
      create: (contract, input, position, options) => contentCommand(options?.content,
        { sessionId: controller.sessionId, resourceKind: contract.resource.kind, contractId: contract.id },
        contentScopeId => controller.execute({ type: "resource.create", sessionId: controller.sessionId, kind: contract.resource.kind, creation: reference(contract), input, position, contentScopeId })),
      refresh: controller.refresh,
    },
    invoke: (contract, input, options) => contentCommand(options?.content,
      { sessionId: controller.sessionId, objectId: object.id, resourceKind: contract.resource.kind, contractId: contract.id },
      contentScopeId => controller.execute({ type: "resource.command", sessionId: controller.sessionId, objectId: object.id, command: resourceCall(contract, input), contentScopeId })),
    openChannel,
    retained,
  };
}

/** 专门能力按对象绑定，读取与基础对象接口相同的宿主状态源。 */
export function ObjectServices({ object, children }: { object: WorkbenchObject; children: ReactNode }) {
  const { controller } = useWorkbench();
  const live = useObjectLive(controller, object.id);
  const registry = useModuleViews();
  // 只订阅本对象的实时块：其他对象生成时，本卡片的模型上下文保持身份。
  const models = useMemo(() => ({ blocks: live }), [live]);
  const tools = useMemo(() => ({ resolve: (props: Parameters<typeof resolveToolView>[0]) => resolveToolView(props, registry), preparation: toolPreparation }), [registry]);
  const preferences = useMemo(() => pluginPreferences(pluginOf(object.kind) ?? "unknown"), [object.kind]);
  return createElement(RendererModelsProvider, { value: models }, createElement(RendererToolsProvider, { value: tools },
    createElement(RendererPreferencesProvider, { value: preferences }, children)));
}
