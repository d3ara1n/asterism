import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineData } from "@asterism-app/sdk/contracts";
import { cardRenderer, toolRenderer } from "@asterism-app/sdk/renderer";
import { ViewRegistry } from "./registry";

const data = defineData("test.text", z.strictObject({ text: z.string() }));
const Body = () => null;
const tool = toolRenderer(data, { result: { bodyRenderer: Body } });
const card = cardRenderer(data, { width: 340, height: 200, Body });

describe("View registration conflicts", () => {
  it("rejects duplicate or empty panel IDs within a card", () => {
    const panel = { id: "details", label: "Details", icon: null, Body };
    expect(() => cardRenderer(data, { width: 340, height: 200, Body, panels: [panel, panel] })).toThrow("Duplicate card panel ID");
    expect(() => cardRenderer(data, { width: 340, height: 200, Body, panels: [{ ...panel, id: " " }] })).toThrow();
  });

  it("rejects duplicate renderer registrations", () => {
    expect(() => new ViewRegistry([{ resources: [], cards: [card, card], tools: [] }])).toThrow();
    expect(() => new ViewRegistry([{ resources: [], cards: [], tools: [tool, tool] }])).toThrow();
  });

  it("rejects duplicate resource descriptions", () => {
    const descriptor = { kind: "text", label: "Text", icon: null };
    expect(() => new ViewRegistry([{ resources: [descriptor, descriptor], cards: [], tools: [] }])).toThrow();
  });
});
