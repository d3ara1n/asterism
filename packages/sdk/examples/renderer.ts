/** 前端作者用例：仅依赖 React、Zod 和公开 SDK，不取用 window.host。 */
import { createElement, useEffect, useState } from "react";
import { z } from "zod";
import { pluginNamespace } from "@atelier/sdk/contracts";
import { cardRenderer, useRendererObject, type RendererModule, type RendererObjectContext } from "@atelier/sdk/renderer";

const ns = pluginNamespace("example.counter");
const Card = ns.data("card", 1, z.strictObject({ value: z.number() }));
function CounterBody({ data }: { data: z.infer<typeof Card.schema> }) {
  const { onStream, invoke, activity, session } = useRendererObject();
  const [bytes, setBytes] = useState(0);
  useEffect(() => onStream("updates", chunk => setBytes(chunk.byteLength)), [onStream]);
  return createElement("button", {
    disabled: activity.running,
    onClick: () => { void invoke({ amount: 1 }); },
  }, `${data.value} · ${bytes} bytes · ${session.snapshot()?.records.all({ scope: "path" }).length ?? 0} records`);
}
export const renderer = {
  resources: [{ kind: ns.name("counter"), label: "Counter", icon: null }],
  cards: [cardRenderer(Card, { width: 300, height: 200, Body: CounterBody })],
  tools: [],
} satisfies RendererModule;

export function createCounter(object: RendererObjectContext) {
  return object.session.create(ns.name("counter"), { title: "Counter" }, { x: 0, y: 0 });
}
