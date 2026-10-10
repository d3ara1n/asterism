import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import type { CardSize, Point } from "../../../shared/workbench";
import { useModuleViews } from "../../modules/views";
import { useWorkbench } from "./context";
import type { ObjectNodeType } from "./ObjectNode";
import { placeObject } from "./placement";
import { cardSize, fallbackCardAppearance } from "./sizing";
import { defaultOverviewMinZoom, focusViewport, overviewMinZoom } from "./viewport";

export type ObjectPlacement = { sessionId: string; position: Point; selectedObjectIds: string[] };

/** 工作台画布的公共入口；屏幕尺寸、测量、动画与保存由画布管理。 */
export interface WorkbenchCanvas {
  /** 没有指定落点时找最近空位；未就绪时返回 null。选择在取用位置时固定。 */
  findPlacement: (options?: { kind?: string; size?: CardSize }) => ObjectPlacement | null;
  /** 打开隐藏对象，等待投影和测量后共同入镜；空列表或失效对象不移动视图。 */
  focusObjects: (objectIds: readonly string[], options?: { select?: boolean }) => Promise<void>;
}

type FocusRequest = { objectIds: string[]; select: boolean; token: number; navigationVersion: number };

/** 下游只消费 WorkbenchCanvas；React Flow 的视口操作与等待集中在此。 */
export function useWorkbenchCanvas(nodes: ObjectNodeType[], setNodes: Dispatch<SetStateAction<ObjectNodeType[]>>, element: RefObject<HTMLDivElement | null>) {
  const { session, controller, run, ready, busy } = useWorkbench();
  const registry = useModuleViews();
  const flow = useReactFlow<ObjectNodeType>();
  const width = useStore(state => state.width);
  const height = useStore(state => state.height);
  const navigationVersion = controller.getSnapshot().navigationVersion;
  const available = useRef(ready);
  available.current = ready;
  const [focusing, setFocusing] = useState<FocusRequest | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);
  useLayoutEffect(() => { sequence.current++; setFocusing(null); }, [navigationVersion]);
  useLayoutEffect(() => {
    if (!ready || busy) { sequence.current++; setFocusing(null); }
  }, [ready, busy]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current++; };
  }, []);

  const findPlacement = useCallback<WorkbenchCanvas["findPlacement"]>((options = {}) => {
    const state = controller.getSnapshot();
    const host = element.current;
    if (!mounted.current || !available.current || state.busy || state.status !== "ready"
      || !host?.clientWidth || !host.clientHeight || !flow.viewportInitialized) return null;
    const viewport = flow.getViewport();
    const center = { x: (host.clientWidth / 2 - viewport.x) / viewport.zoom, y: (host.clientHeight / 2 - viewport.y) / viewport.zoom };
    const appearance = options.kind ? registry.resource(options.kind).card ?? fallbackCardAppearance : fallbackCardAppearance;
    const current = flow.getNodes();
    return {
      sessionId: controller.sessionId,
      position: placeObject(center, cardSize(appearance, options.size), current),
      selectedObjectIds: current.filter(node => node.selected).map(node => node.id),
    };
  }, [controller, element, flow, registry]);

  const focusObjects = useCallback<WorkbenchCanvas["focusObjects"]>(async (ids, options) => {
    const state = controller.getSnapshot();
    const workbench = state.snapshot?.workbench;
    const objectIds = [...new Set(ids)];
    if (!mounted.current || !available.current || state.busy || state.status !== "ready" || !workbench || !objectIds.length) return;
    const objects = new Set(workbench.objects.map(object => object.id));
    if (!objectIds.every(id => objects.has(id))) return;
    const token = ++sequence.current;
    setFocusing(null);
    const valid = () => {
      const current = controller.getSnapshot();
      return mounted.current && sequence.current === token && current.status === "ready"
        && current.navigationVersion === state.navigationVersion;
    };
    const hidden = new Set(workbench.views.filter(view => view.hidden).map(view => view.objectId));
    for (const objectId of objectIds) {
      if (!hidden.has(objectId)) continue;
      if (!valid() || !(await controller.executeAndRead({ type: "view.set", sessionId: controller.sessionId, objectId, hidden: false })).ok) return;
    }
    // 受理与节点投影分离；画布等待全部目标测量，而非猜测某一帧已经渲染完。
    if (valid()) setFocusing({ objectIds, select: options?.select ?? false, token, navigationVersion: state.navigationVersion });
  }, [controller]);

  const targetsReady = !!focusing && focusing.objectIds.every(id => {
    const node = nodes.find(node => node.id === id);
    return !!node?.measured?.width && !!node.measured.height;
  });
  useEffect(() => {
    if (!focusing || !targetsReady || !width || !height || !flow.viewportInitialized) return;
    let active = true, animating = false;
    const frame = requestAnimationFrame(() => {
      if (sequence.current !== focusing.token || !element.current) return;
      if (focusing.select) setNodes(current => current.map(node => ({ ...node, selected: focusing.objectIds.includes(node.id) })));
      const bounds = flow.getNodesBounds(focusing.objectIds);
      const viewport = focusViewport(bounds, width, height);
      animating = true;
      void flow.setViewport(viewport, { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420 }).then(() => {
        animating = false;
        if (!active || sequence.current !== focusing.token || controller.getSnapshot().navigationVersion !== focusing.navigationVersion) return;
        setFocusing(current => current?.token === focusing.token ? null : current);
        void run({ type: "viewport.set", sessionId: controller.sessionId, viewport: flow.getViewport() });
      });
    });
    return () => {
      active = false; cancelAnimationFrame(frame);
      if (animating) void flow.setViewport(flow.getViewport(), { duration: 0 });
    };
  }, [focusing, targetsReady, width, height, flow, element, setNodes, controller, run]);

  const minZoom = width && height
    ? overviewMinZoom(flow.getNodesBounds(nodes), width, height)
    : Math.min(defaultOverviewMinZoom, session.viewport.zoom);
  const api = useMemo<WorkbenchCanvas>(() => ({ findPlacement, focusObjects }), [findPlacement, focusObjects]);
  return { api, minZoom };
}
