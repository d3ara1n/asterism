import { Allow, parse } from "partial-json";
import type { Json } from "@asterism/sdk/contracts";
import type { LiveBlock } from "./session.ts";

/** 宽容解析流式工具参数，只用于展示与调用身份；空文本或无法解析时为 null。NaN／Infinity 不属于 JSON，不接受。 */
export function previewArguments(text: string): Json {
  if (!text.trim()) return null;
  try { return (parse(text, Allow.ALL & ~Allow.SPECIAL) ?? null) as Json; }
  catch { return null; }
}

/** 线上形态：输入阶段的工具调用只传 argumentsText，arguments 由接收端推导。 */
export function wireLive(block: LiveBlock): LiveBlock {
  return block.kind === "toolcall" && block.state === "input" && block.arguments !== null ? { ...block, arguments: null } : block;
}

const derived = new WeakMap<LiveBlock, LiveBlock>();
/** 接收端补回输入阶段的预览参数；同一线上块对象复用同一结果，未变化的块保持身份。 */
export function viewLive(block: LiveBlock): LiveBlock {
  if (block.kind !== "toolcall" || block.state !== "input") return block;
  let view = derived.get(block);
  if (!view) { view = { ...block, arguments: previewArguments(block.argumentsText) }; derived.set(block, view); }
  return view;
}
