import { RendererNavigationProvider } from "@atelier/sdk/renderer";
import { AnimatePresence, motion } from "motion/react";
import { PanelLeftClose } from "lucide-react";
import { useMemo } from "react";

import type { WorkbenchObject } from "../../../shared/workbench";
import { objectsMessages } from "../../messages/objects";
import { RendererCatalogProvider } from "../../modules/object-context";
import { useI18n } from "../../shared/i18n";
import { fadeTransition } from "../../shared/weave/motion";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { useWorkbench, WorkbenchScope, type WorkbenchStore } from "./context";
import { exitFocus } from "./focus";
import { useObjectView } from "./object-view";
import { ObjectSurface } from "./ObjectSurface";

/**
 * 聚焦浮岛内容：与卡片同一份对象视图，换到浮岛容器中重新挂载。
 * 浮岛身份固定，切换会话或聚焦对象时只交替其中内容；环境经 WorkbenchScope 绑定到所属会话。
 */
export function FocusIsland({ store, sessionId, objectId, onHome }: {
  store: WorkbenchStore; sessionId: string; objectId: string; onHome: () => void;
}) {
  const navigation = useMemo(() => ({ home: onHome }), [onHome]);
  return <AnimatePresence mode="popLayout" initial={false}>
    <motion.div key={`${sessionId}\u0000${objectId}`} className="h-full overflow-hidden"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeTransition}>
      <WorkbenchScope store={store} sessionId={sessionId}>
        <RendererNavigationProvider value={navigation}>
          <FocusedContent objectId={objectId} />
        </RendererNavigationProvider>
      </WorkbenchScope>
    </motion.div>
  </AnimatePresence>;
}

function FocusedContent({ objectId }: { objectId: string }) {
  const { session, ready } = useWorkbench();
  const object = session.objects.find(item => item.id === objectId);
  // 对象被移除后由工作台结束聚焦；此前不渲染内容。
  return object ? <RendererCatalogProvider ready={ready}><FocusedObject object={object} /></RendererCatalogProvider> : null;
}

function FocusedObject({ object }: { object: WorkbenchObject }) {
  const i18n = useI18n();
  const { session } = useWorkbench();
  const content = useObjectView(object);
  return <ObjectSurface icon={content.icon} kind={content.kind} title={object.title} actions={content.actions} panels={content.panels}
    controls={<IconButton size="icon-xs" label={i18n.text(objectsMessages.returnToCard)} onClick={() => exitFocus(session.id, object.id)}>
      <PanelLeftClose />
    </IconButton>}>
    {content.body}
  </ObjectSurface>;
}
