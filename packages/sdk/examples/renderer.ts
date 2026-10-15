import { Counter, CounterView as Card, CreateCounter, ChangeCount } from "./counter-contract.ts";
/** 前端作者用例：仅依赖 React、Zod 和公开 SDK，不取用 window.host。 */
import { createElement, useEffect, useState } from "react";
import { z } from "zod";
import { cardRenderer, useRendererCard, useRendererObject, type RendererModule, type RendererObjectContext } from "@atelier/sdk/renderer";

function CounterBody({ data }: { data: z.infer<typeof Card.schema> }) {
  const { onStream, invoke, activity, session } = useRendererObject();
  const card = useRendererCard();
  const [bytes, setBytes] = useState(0);
  useEffect(() => onStream("updates", chunk => setBytes(chunk.byteLength)), [onStream]);
  return createElement("div", null, createElement("button", {
    disabled: activity.running,
    onClick: () => { void invoke(ChangeCount, { amount: 1 }); },
  }, `${data.value} · ${bytes} bytes · ${session.snapshot()?.records.all({ scope: "timeline" }).length ?? 0} records`),
  createElement("button", { onClick: () => card.openPanel("details") }, "Details"));
}
function CounterDetails({ data }: { data: z.infer<typeof Card.schema> }) {
  const card = useRendererCard();
  return createElement("div", null, `Count: ${data.value}`,
    createElement("button", { onClick: card.closePanel }, "Close"));
}
export const renderer = {
  resources: [{ kind: Counter.kind, label: "Counter", icon: null }],
  cards: [cardRenderer(Card, { width: 300, height: 200, Body: CounterBody,
    panels: [{ id: "details", label: "Details", icon: null, Body: CounterDetails }] })],
  tools: [],
} satisfies RendererModule;

export function createCounter(object: RendererObjectContext) {
  return object.session.create(CreateCounter, {}, { x: 0, y: 0 });
}

export function rejectInvalidCalls(object: RendererObjectContext) {
  // @ts-expect-error 动作参数由共享契约推导，拼错字段不能编译。
  void object.invoke(ChangeCount, { amout: 1 });
  // @ts-expect-error 创建参数不能仅凭资源 kind 绕过契约。
  void object.session.create(Counter.kind, {}, { x: 0, y: 0 });
  // @ts-expect-error 普通对象接口不包含模型输出或对话草稿。
  object.activity.blocks;
}
