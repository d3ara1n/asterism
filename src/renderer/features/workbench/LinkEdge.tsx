import { getBezierPath, getSmoothStepPath, Position, type Edge, type EdgeProps } from "@xyflow/react";
import { memo, useLayoutEffect, useRef, type CSSProperties } from "react";

import type { Appearance } from "../../../shared/theme";
import type { ConnectionEdge } from "./connections";

type LinkEdgeType = Edge<ConnectionEdge["data"]>;

/** 指向卡片外侧的单位法向。 */
const outward: Record<Position, readonly [number, number]> = {
  [Position.Left]: [-1, 0], [Position.Right]: [1, 0], [Position.Top]: [0, -1], [Position.Bottom]: [0, 1],
};
/**
 * 端点尺寸的唯一来源，样式表经 CSS 变量读取。xyflow 以定位盒外沿为锚点，定位盒跨在卡片边缘上，
 * 边缘位于锚点内侧半个盒宽；箭头尖端停在可见圆点（含描边）外沿。
 */
const handleBox = 7;
const handleDot = 10;
export const handleSizeVariables = { "--handle-box": `${handleBox}px`, "--handle-dot": `${handleDot}px` } as CSSProperties;
const anchorInset = handleBox / 2;
const dotRadius = handleDot / 2;
/** 箭头长度；线身收在箭头底边内。 */
const headLength = 9;
/** 路径短于此长度时不画中段箭头，避免与两端标记挤在一起。 */
const midArrowMinLength = 72;

/** 圆角实心箭头，尖端在原点、指向 +x。 */
const headPath = `M0 0 L${-headLength} ${-headLength * 0.55} Q${-headLength * 0.72} 0 ${-headLength} ${headLength * 0.55} Z`;
/** 中段开口箭头，中心在原点、指向 +x。 */
const chevronPath = "M-2.5 -4 L2 0 L-2.5 4";

function offset(x: number, y: number, side: Position, distance: number) {
  const [nx, ny] = outward[side];
  return { x: x + nx * distance, y: y + ny * distance };
}

/** 箭头：尖端指向并贴住该端的端点圆点，朝卡片内侧。 */
function Head({ x, y, side }: { x: number; y: number; side: Position }) {
  const [nx, ny] = outward[side];
  const angle = Math.atan2(-ny, -nx) * 180 / Math.PI;
  return <path className="link-edge-head" d={headPath} transform={`translate(${x} ${y}) rotate(${angle})`} />;
}

/**
 * 工作台连线：起点端点圆点、终点指向端点圆点的实心箭头与中段方向箭头共同表达链接方向；
 * 选中时沿方向流动。两端都落在卡片边缘的端点上，路径沿用连线风格对应的原生算法。
 */
function LinkEdge({ kind, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data, interactionWidth }:
  EdgeProps<LinkEdgeType> & { kind: Appearance["edgeStyle"] }) {
  const mutual = (data?.links.length ?? 0) === 2;
  const sourceEdge = offset(sourceX, sourceY, sourcePosition, -anchorInset);
  const sourceTip = offset(sourceX, sourceY, sourcePosition, dotRadius - anchorInset);
  const targetTip = offset(targetX, targetY, targetPosition, dotRadius - anchorInset);
  // 单向起点从卡片边缘出发、由端点圆点盖住；箭头一端收到箭头底边内。
  const inset = headLength * 0.8;
  const start = mutual ? offset(sourceTip.x, sourceTip.y, sourcePosition, inset) : sourceEdge;
  const end = offset(targetTip.x, targetTip.y, targetPosition, inset);
  const endpoints = { sourceX: start.x, sourceY: start.y, sourcePosition, targetX: end.x, targetY: end.y, targetPosition };
  const [path] = kind === "default" ? getBezierPath(endpoints) : getSmoothStepPath({ ...endpoints, borderRadius: kind === "step" ? 0 : 5 });
  const line = useRef<SVGPathElement>(null);
  const chevron = useRef<SVGPathElement>(null);
  // 中段箭头取路径弧长中点与该处切线，三种风格共用同一测量。
  useLayoutEffect(() => {
    const element = line.current, mark = chevron.current;
    if (!element || !mark) return;
    const length = element.getTotalLength();
    if (length < midArrowMinLength) { mark.style.visibility = "hidden"; return; }
    const middle = length / 2;
    const at = element.getPointAtLength(middle);
    const before = element.getPointAtLength(middle - 0.5);
    const after = element.getPointAtLength(middle + 0.5);
    const angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
    mark.setAttribute("transform", `translate(${at.x} ${at.y}) rotate(${angle})`);
    mark.style.visibility = "";
  }, [path, mutual]);
  return <g className="link-edge" data-selected={selected ? "" : undefined}>
    <path className="link-edge-halo" d={path} />
    <path ref={line} className="link-edge-line" d={path} />
    {selected && !mutual && <path className="link-edge-flow" d={path} />}
    {!mutual && <path ref={chevron} className="link-edge-chevron" d={chevronPath} />}
    {mutual && <Head x={sourceTip.x} y={sourceTip.y} side={sourcePosition} />}
    <Head x={targetTip.x} y={targetTip.y} side={targetPosition} />
    <path className="react-flow__edge-interaction" d={path} fill="none" strokeOpacity={0} strokeWidth={interactionWidth} />
  </g>;
}

const MemoLinkEdge = memo(LinkEdge);
/** 每种连线风格注册一个边类型，组件本身共用。 */
export const linkEdgeTypes = {
  default: (props: EdgeProps<LinkEdgeType>) => <MemoLinkEdge {...props} kind="default" />,
  step: (props: EdgeProps<LinkEdgeType>) => <MemoLinkEdge {...props} kind="step" />,
  smoothstep: (props: EdgeProps<LinkEdgeType>) => <MemoLinkEdge {...props} kind="smoothstep" />,
} satisfies Record<Appearance["edgeStyle"], unknown>;
