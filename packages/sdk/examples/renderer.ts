import { Counter, CounterView as Card, CreateCounter, ChangeCount, CounterUpdates, counterCard } from "./counter-contract.ts";
/** 前端作者用例：仅依赖 React、Zod 和公开 SDK，不取用 window.host。 */
import { createElement, useEffect, useState } from "react";
import { z } from "zod";
import { defineRendererPlugin, cardRenderer, useRendererCard, useRendererObject, type RendererModule, type RendererObjectContext } from "@asterism/sdk/renderer";

function CounterBody({ data }: { data: z.infer<typeof Card.schema> }) {
  const { openChannel, invoke, view, session } = useRendererObject();
  const [pending, setPending] = useState(false);
  const card = useRendererCard();
  const [live, setLive] = useState<number | null>(null);
  useEffect(() => {
    const channel = openChannel(CounterUpdates);
    channel.onMessage(update => setLive(update.value));
    channel.send({ type: "subscribe" });
    return () => channel.close();
  }, [openChannel]);
  return createElement("div", null, createElement("button", {
    disabled: !view.ready || pending,
    onClick: () => {
      setPending(true);
      void invoke(ChangeCount, { amount: 1 }).finally(() => setPending(false));
    },
  }, `${data.value} · live ${live ?? "-"} · ${session.snapshot()?.records.all({ scope: "timeline" }).length ?? 0} records`),
  createElement("button", { onClick: () => card.openPanel("details") }, "Details"));
}
function CounterDetails({ data }: { data: z.infer<typeof Card.schema> }) {
  const card = useRendererCard();
  return createElement("div", null, `Count: ${data.value}`,
    createElement("button", { onClick: card.closePanel }, "Close"));
}
export const renderer = {
  resources: [{ kind: Counter.kind, label: "Counter", icon: null, card: counterCard }],
  cards: [cardRenderer(Card, { ...counterCard, Body: CounterBody,
    panels: [{ id: "details", label: "Details", icon: null, Body: CounterDetails }] })],
  tools: [],
} satisfies RendererModule;
export default defineRendererPlugin({ modules: [renderer] });

export function createCounter(object: RendererObjectContext) {
  return object.session.create(CreateCounter, {}, { x: 0, y: 0 });
}

/** 按对象保留的前端状态：跨重挂载与会话切换保持，对象离开投影时由宿主调用 release。 */
export function counterNote(object: RendererObjectContext) {
  return object.retained.get("example.counter/note", () => ({ text: "" }), note => { note.text = ""; });
}

export function rejectInvalidCalls(object: RendererObjectContext) {
  // @ts-expect-error 动作参数由共享契约推导，拼错字段不能编译。
  void object.invoke(ChangeCount, { amout: 1 });
  // @ts-expect-error 创建参数不能仅凭资源 kind 绕过契约。
  void object.session.create(Counter.kind, {}, { x: 0, y: 0 });
  // @ts-expect-error 普通对象接口不包含模型输出或对话草稿。
  object.activity.blocks;
}
