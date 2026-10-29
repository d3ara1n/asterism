import { getBezierPath, getSmoothStepPath, Position, type Edge, type EdgeProps } from "@xyflow/react";
import { memo, useLayoutEffect, useRef, type CSSProperties } from "react";

import type { Appearance } from "../../../shared/theme";
import type { ConnectionEdge } from "./connections";
import { useI18n } from "../../shared/i18n";
import { objectsMessages } from "../../messages/objects";

type LinkEdgeType = Edge<ConnectionEdge["data"]>;

/** Unit normal pointing outward from the card. */
const outward: Record<Position, readonly [number, number]> = {
  [Position.Left]: [-1, 0], [Position.Right]: [1, 0], [Position.Top]: [0, -1], [Position.Bottom]: [0, 1],
};
/**
 * Sole source of endpoint dimensions, read by the stylesheet through CSS variables. xyflow anchors to the outer edge of the positioning box, which straddles the card edge,
 * placing the edge half a box width inside the anchor; the arrow tip stops at the outer edge of the visible dot (including its stroke).
 */
const handleBox = 7;
const handleDot = 7;
export const handleSizeVariables = { "--handle-box": `${handleBox}px`, "--handle-dot": `${handleDot}px` } as CSSProperties;
const anchorInset = handleBox / 2;
const dotRadius = handleDot / 2;
/** Arrow length; the line ends inside the arrow's base. */
const headLength = 9;
/** Omit the middle arrow for paths shorter than this to avoid crowding the endpoint markers. */
const midArrowMinLength = 72;

/** Rounded solid arrow, with its tip at the origin and pointing toward +x. */
const headPath = `M0 0 L${-headLength} ${-headLength * 0.55} Q${-headLength * 0.72} 0 ${-headLength} ${headLength * 0.55} Z`;
/** Open middle arrow, centered at the origin and pointing toward +x. */
const chevronPath = "M-2.5 -4 L2 0 L-2.5 4";

function offset(x: number, y: number, side: Position, distance: number) {
  const [nx, ny] = outward[side];
  return { x: x + nx * distance, y: y + ny * distance };
}

/** Arrow: the tip points toward and touches that endpoint's dot, facing into the card. */
function Head({ x, y, side }: { x: number; y: number; side: Position }) {
  const [nx, ny] = outward[side];
  const angle = Math.atan2(-ny, -nx) * 180 / Math.PI;
  return <path className="link-edge-head" d={headPath} transform={`translate(${x} ${y}) rotate(${angle})`} />;
}

/**
 * Workbench connection: the source endpoint dot, solid destination arrow pointing to its dot, and middle direction arrow together express link direction;
 * flows along that direction when selected. Both ends sit on card-edge endpoints, and paths use the native algorithm for the selected connection style.
 */
function LinkEdge({ kind, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data, interactionWidth }:
  EdgeProps<LinkEdgeType> & { kind: Appearance["edgeStyle"] }) {
  const i18n = useI18n();
  const holds = data?.links.reduce((total, link) => total + (link.holds ?? 0), 0) ?? 0;
  const mutual = (data?.links.length ?? 0) === 2;
  const sourceEdge = offset(sourceX, sourceY, sourcePosition, -anchorInset);
  const sourceTip = offset(sourceX, sourceY, sourcePosition, dotRadius - anchorInset);
  const targetTip = offset(targetX, targetY, targetPosition, dotRadius - anchorInset);
  // A one-way source starts at the card edge beneath the endpoint dot; the arrow end stops inside the arrow's base.
  const inset = headLength * 0.8;
  const start = mutual ? offset(sourceTip.x, sourceTip.y, sourcePosition, inset) : sourceEdge;
  const end = offset(targetTip.x, targetTip.y, targetPosition, inset);
  const endpoints = { sourceX: start.x, sourceY: start.y, sourcePosition, targetX: end.x, targetY: end.y, targetPosition };
  const [path, labelX, labelY] = kind === "default" ? getBezierPath(endpoints) : getSmoothStepPath({ ...endpoints, borderRadius: kind === "step" ? 0 : 5 });
  const line = useRef<SVGPathElement>(null);
  const chevron = useRef<SVGPathElement>(null);
  // The middle arrow uses the path's arc-length midpoint and tangent there; all three styles share the same measurement.
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
    <path ref={line} className="link-edge-line" d={path} strokeDasharray={holds ? "5 4" : undefined} />
    {selected && !mutual && <path className="link-edge-flow" d={path} />}
    {!mutual && !holds && <path ref={chevron} className="link-edge-chevron" d={chevronPath} />}
    {mutual && <Head x={sourceTip.x} y={sourceTip.y} side={sourcePosition} />}
    <Head x={targetTip.x} y={targetTip.y} side={targetPosition} />
    {!!holds && <g transform={`translate(${labelX} ${labelY})`} role="img" aria-label={i18n.formatMessage(objectsMessages.linkHolds, { count: holds })}>
      <rect className="fill-background stroke-border" x={-(String(holds).length * 8 + 12) / 2} y={-10} width={String(holds).length * 8 + 12} height={20} rx={5} />
      <text className="fill-foreground type-caption" textAnchor="middle" dominantBaseline="central">{holds}</text>
    </g>}
    <path className="react-flow__edge-interaction" d={path} fill="none" strokeOpacity={0} strokeWidth={interactionWidth} />
  </g>;
}

const MemoLinkEdge = memo(LinkEdge);
/** Register one edge type per connection style, sharing the component itself. */
export const linkEdgeTypes = {
  default: (props: EdgeProps<LinkEdgeType>) => <MemoLinkEdge {...props} kind="default" />,
  step: (props: EdgeProps<LinkEdgeType>) => <MemoLinkEdge {...props} kind="step" />,
  smoothstep: (props: EdgeProps<LinkEdgeType>) => <MemoLinkEdge {...props} kind="smoothstep" />,
} satisfies Record<Appearance["edgeStyle"], unknown>;
