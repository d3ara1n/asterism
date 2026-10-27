import { Counter, CounterView as Card, CreateCounter, ChangeCount, CounterUpdates, counterCard } from "./counter-contract.ts";
/** Frontend author example: depends only on React, Zod, and the public SDK, without accessing window.host. */
import { createElement, useEffect, useState } from "react";
import { z } from "zod";
import { defineRendererPlugin, cardRenderer, useRendererCard, useRendererObject, type RendererModule, type RendererObjectContext } from "@asterism-app/sdk/renderer";

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

/** Frontend state retained per object: survives remounts and session switches; the host calls release when the object leaves the projection. */
export function counterNote(object: RendererObjectContext) {
  return object.retained.get("example.counter/note", () => ({ text: "" }), note => { note.text = ""; });
}
