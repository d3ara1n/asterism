import { createElement, useMemo, type ReactNode } from "react";
import { RendererCatalogsProvider, RendererModelsProvider, RendererPreferencesProvider, RendererToolsProvider, type RendererCatalogs, type RendererObjectContext } from "@asterism-app/sdk/renderer";
import { pluginOf, resourceCall, reference, ModelCatalog, ShellProfilesCatalog } from "@asterism-app/sdk/contracts";
import type { WorkbenchObject } from "../../shared/workbench";
import { useWorkbench } from "../features/workbench/context";
import { useObjectLive, useSession } from "../features/session/state";
import { useConfiguration } from "../features/configuration/state";
import { resolveToolView, toolIcon, toolLabel, toolPreparation } from "../features/conversation/tool-views";
import { useModuleViews } from "./views";
import { pluginPreferences } from "../features/creation/preferences";
import { contentCommand } from "../features/creation/content";
import { objectCapabilities } from "./object-capabilities";

export function RendererCatalogProvider({ ready, children }: { ready: boolean; children: ReactNode }) {
  const configuration = useConfiguration(ready);
  const value = useMemo<RendererCatalogs>(() => ({
    error: configuration.readError,
    get(contract) {
      const raw = Object.is(contract, ModelCatalog) ? configuration.snapshot
        : Object.is(contract, ShellProfilesCatalog) ? configuration.snapshot?.shell : null;
      const parsed = contract.schema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
  }), [configuration.readError, configuration.snapshot]);
  return createElement(RendererCatalogsProvider, { value }, children);
}

/** The host supplies coordinated session views and object capabilities to SDK cards without exposing controllers or physical nodes. */
export function useObjectContext(object: WorkbenchObject): RendererObjectContext {
  const workbench = useWorkbench();
  const { controller } = workbench;
  const { state } = useSession(controller);
  const records = controller.recordSnapshot();
  // Build identity-only capabilities outside this hook's closure scope: retained drafts and clients may outlive the view.
  const capabilities = useMemo(() => objectCapabilities(controller.sessionId, object.id, object.kind),
    [controller.sessionId, object.id, object.kind]);
  return {
    ...capabilities,
    view: { ready: workbench.ready, error: state.readError, missing: state.missing },
    session: {
      snapshot: () => records, subscribe: controller.subscribe,
      create: (contract, input, position, options) => contentCommand(options?.content,
        { kind: "resource", sessionId: controller.sessionId, resourceKind: contract.resource.kind, contractId: contract.id },
        contentScopeId => controller.execute({ type: "resource.create", sessionId: controller.sessionId, kind: contract.resource.kind, creation: reference(contract), input, position, contentScopeId })),
      refresh: controller.refresh,
    },
    invoke: (contract, input, options) => contentCommand(options?.content,
      { kind: "resource", sessionId: controller.sessionId, objectId: object.id, resourceKind: contract.resource.kind, contractId: contract.id },
      contentScopeId => controller.execute({ type: "resource.command", sessionId: controller.sessionId, objectId: object.id, command: resourceCall(contract, input), contentScopeId })),
  };
}

/** Specialized capabilities are bound per object and read the same host state source as the base object interface. */
export function ObjectServices({ object, children }: { object: WorkbenchObject; children: ReactNode }) {
  const { controller } = useWorkbench();
  const live = useObjectLive(controller, object.id);
  const registry = useModuleViews();
  // Subscribe only to this object's live blocks: this card's model context retains its identity while other objects generate.
  const models = useMemo(() => ({ blocks: live }), [live]);
  const tools = useMemo(() => ({ resolve: (props: Parameters<typeof resolveToolView>[0]) => resolveToolView(props, registry), preparation: toolPreparation,
    label: (name: string, implementation: string | null) => toolLabel(name, implementation, registry),
    icon: (name: string, implementation: string | null) => toolIcon(name, implementation, registry) }), [registry]);
  const preferences = useMemo(() => pluginPreferences(pluginOf(object.kind) ?? "unknown"), [object.kind]);
  return createElement(RendererModelsProvider, { value: models }, createElement(RendererToolsProvider, { value: tools },
    createElement(RendererPreferencesProvider, { value: preferences }, children)));
}
