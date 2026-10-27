import { Counter, CounterView as Card, CreateCounter, ChangeCount, CounterUpdates, counterCard } from "../examples/counter-contract.ts";
import { createElement, useEffect, useState } from "react";
import { z } from "zod";
import { defineRendererPlugin, cardRenderer, useRendererCard, useRendererObject, type RendererModule, type RendererObjectContext } from "@asterism/sdk/renderer";

export function rejectInvalidCalls(object: RendererObjectContext) {
  // @ts-expect-error Action parameters are inferred from the shared contract; misspelled fields do not compile.
  void object.invoke(ChangeCount, { amout: 1 });
  // @ts-expect-error Creation parameters cannot bypass the contract using only the resource kind.
  void object.session.create(Counter.kind, {}, { x: 0, y: 0 });
  // @ts-expect-error The ordinary object interface does not include model output or conversation drafts.
  object.activity.blocks;
}
