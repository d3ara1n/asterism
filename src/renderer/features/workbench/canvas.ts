import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import type { CardSize, Point } from "../../../shared/workbench";
import { useModuleViews } from "../../modules/views";
import { useWorkbench } from "./context";
import type { ObjectNodeType } from "./ObjectNode";
import { placeObject } from "./placement";
import { cardSize, fallbackCardAppearance } from "./sizing";
import { defaultOverviewMinZoom, locateViewport, overviewMinZoom } from "./viewport";
import { operationSucceeded } from "../../shared/toast";

export type ObjectPlacement = { sessionId: string; position: Point; selectedObjectIds: string[] };

/** 工作台画布的公共入口；屏幕尺寸、测量、动画与保存由画布管理。 */
export interface WorkbenchCanvas {
  /** 没有指定落点时找最近空位；未就绪时返回 null。选择在取用位置时固定。 */
  findPlacement: (options?: { kind?: string; size?: CardSize }) => ObjectPlacement | null;
  /** 打开隐藏对象，等待投影和测量后共同入镜；空列表或失效对象不移动视图。 */
  locateObjects: (objectIds: readonly string[], options?: { select?: boolean }) => Promise<void>;
}

type LocateRequest = { objectIds: string[]; select: boolean; token: number; selectionVersion: number };

/** 下游只消费 WorkbenchCanvas；React Flow 的视口操作与等待集中在此。 */
export function useWorkbenchCanvas(nodes: ObjectNodeType[], setNodes: Dispatch<SetStateAction<ObjectNodeType[]>>, element: RefObject<HTMLDivElement | null>) {
  const { session, controller, run, ready } = useWorkbench();
  const registry = useModuleViews();
  const flow = useReactFlow<ObjectNodeType>();
  const width = useStore(state => state.width);
  const height = useStore(state => state.height);
  const selectionVersion = controller.getSnapshot().selectionVersion;
  const available = useRef(ready);
  available.current = ready;
  const [locating, setLocating] = useState<LocateRequest | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);
  useLayoutEffect(() => { sequence.current++; setLocating(null); }, [selectionVersion]);
  useLayoutEffect(() => {
    if (!ready) { sequence.current++; setLocating(null); }
  }, [ready]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current++; };
  }, []);

  const findPlacement = useCallback<WorkbenchCanvas["findPlacement"]>((options = {}) => {
    const state = controller.getSnapshot();
    const host = element.current;
    if (!mounted.current || !available.current || state.navigating || state.status !== "ready"
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

  const locateObjects = useCallback<WorkbenchCanvas["locateObjects"]>(async (ids, options) => {
    const state = controller.getSnapshot();
    const workbench = state.snapshot?.workbench;
    const objectIds = [...new Set(ids)];
    if (!mounted.current || !available.current || state.navigating || state.status !== "ready" || !workbench || !objectIds.length) return;
    const objects = new Set(workbench.objects.map(object => object.id));
    if (!objectIds.every(id => objects.has(id))) return;
    const token = ++sequence.current;
    setLocating(null);
    const valid = () => {
      const current = controller.getSnapshot();
      return mounted.current && sequence.current === token && current.status === "ready"
        && current.selectionVersion === state.selectionVersion;
    };
    const hidden = new Set(workbench.views.filter(view => view.hidden).map(view => view.objectId));
    for (const objectId of objectIds) {
      if (!hidden.has(objectId)) continue;
      if (!valid() || !operationSucceeded(await controller.executeAndRead({ type: "view.set", sessionId: controller.sessionId, objectId, hidden: false }))) return;
    }
    // 受理与节点投影分离；画布等待全部目标测量，而非猜测某一帧已经渲染完。
    if (valid()) setLocating({ objectIds, select: options?.select ?? false, token, selectionVersion: state.selectionVersion });
  }, [controller]);

  const targetsReady = !!locating && locating.objectIds.every(id => {
    const node = nodes.find(node => node.id === id);
    return !!node?.measured?.width && !!node.measured.height;
  });
  useEffect(() => {
    if (!locating || !targetsReady || !width || !height || !flow.viewportInitialized) return;
    let active = true, animating = false;
    const frame = requestAnimationFrame(() => {
      if (sequence.current !== locating.token || !element.current) return;
      if (locating.select) setNodes(current => current.map(node => ({ ...node, selected: locating.objectIds.includes(node.id) })));
      const bounds = flow.getNodesBounds(locating.objectIds);
      const viewport = locateViewport(bounds, width, height);
      animating = true;
      void flow.setViewport(viewport, { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420 }).then(() => {
        animating = false;
        if (!active || sequence.current !== locating.token || controller.getSnapshot().selectionVersion !== locating.selectionVersion) return;
        setLocating(current => current?.token === locating.token ? null : current);
        void run({ type: "viewport.set", sessionId: controller.sessionId, viewport: flow.getViewport() });
      });
    });
    return () => {
      active = false; cancelAnimationFrame(frame);
      if (animating) void flow.setViewport(flow.getViewport(), { duration: 0 });
    };
  }, [locating, targetsReady, width, height, flow, element, setNodes, controller, run]);

  const minZoom = width && height
    ? overviewMinZoom(flow.getNodesBounds(nodes), width, height)
    : Math.min(defaultOverviewMinZoom, session.viewport.zoom);
  const api = useMemo<WorkbenchCanvas>(() => ({ findPlacement, locateObjects }), [findPlacement, locateObjects]);
  return { api, minZoom };
}
