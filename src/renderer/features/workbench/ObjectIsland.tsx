import { RendererNavigationProvider } from "@asterism-app/sdk/renderer";
import { PanelLeftClose } from "lucide-react";
import { useMemo } from "react";

import { objectIslandId, type WorkbenchObject } from "../../../shared/workbench";
import { objectsMessages } from "../../messages/objects";
import { RendererCatalogProvider } from "../../modules/object-context";
import { useI18n } from "../../shared/i18n";
import { IslandMenu } from "../../shared/weave/IslandMenu";
import type { IslandSpec } from "../../shared/weave/Screen";
import { useIsland } from "../../shared/weave/Screen";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { useWorkbench, WorkbenchScope, type WorkbenchStore } from "./context";
import { useObjectView } from "./object-view";
import { ObjectSurface } from "./ObjectSurface";

/** Shares the screen by default; size presets scale its 720px medium width. */
const objectIslandWidth = { min: 480, grow: 1.5 };

/**
 * Object island: one per object, holding the same object view as its card. While it is open, the card shows a notice instead of the content,
 * so the content mounts once. Its identity is derived from the object, so opening the object again locates this island.
 */
export function objectIslandSpec({ store, sessionId, object, origin, onHome }: {
  store: WorkbenchStore; sessionId: string; object: Pick<WorkbenchObject, "id" | "title">; origin: HTMLElement | null; onHome: () => void;
}): IslandSpec {
  return {
    id: objectIslandId(object.id), label: object.title, width: objectIslandWidth, origin,
    restore: { kind: "object", objectId: object.id },
    render: () => <ObjectIsland store={store} sessionId={sessionId} objectId={object.id} onHome={onHome} />,
  };
}

/** The island renders outside the workbench subtree; WorkbenchScope binds it to its session's environment. */
function ObjectIsland({ store, sessionId, objectId, onHome }: { store: WorkbenchStore; sessionId: string; objectId: string; onHome: () => void }) {
  const navigation = useMemo(() => ({ home: onHome }), [onHome]);
  return <div className="h-full overflow-hidden">
    <WorkbenchScope store={store} sessionId={sessionId}>
      <RendererNavigationProvider value={navigation}><IslandContent objectId={objectId} /></RendererNavigationProvider>
    </WorkbenchScope>
  </div>;
}

function IslandContent({ objectId }: { objectId: string }) {
  const { session, ready } = useWorkbench();
  const object = session.objects.find(item => item.id === objectId && !item.retiring);
  // The workbench closes islands whose content left the projection; render nothing in the meantime.
  return object ? <RendererCatalogProvider ready={ready}><IslandObject object={object} /></RendererCatalogProvider> : null;
}

function IslandObject({ object }: { object: WorkbenchObject }) {
  const i18n = useI18n();
  const island = useIsland();
  const content = useObjectView(object);
  return <ObjectSurface icon={content.icon} kind={content.kind} title={object.title} actions={content.actions} panels={content.panels}
    controls={<>
      <IslandMenu />
      <IconButton size="icon-xs" label={i18n.text(objectsMessages.returnToCard)} onClick={() => { void island.close(); }}>
        <PanelLeftClose />
      </IconButton>
    </>}>
    {content.body}
  </ObjectSurface>;
}
