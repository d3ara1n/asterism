import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineData } from "./presentation.ts";
import { toolRenderer, type ToolRenderProps } from "./renderer-tools.ts";

const contract = {
  ...defineData("example.preview", z.object({ text: z.string().trim() })),
  tool: { argsSchema: z.object({ content: z.string() }) },
};
const input: ToolRenderProps = { phase: "input", name: "preview", target: null, args: {}, invocation: {}, result: null };

describe("Tool streaming preview declarations", () => {
  // Input streaming precedes complete arguments, so declarations must accept partial JSON; a body component alone cannot substitute for an explicit plugin declaration.
  it("plugins decide whether partial input is previewable, while undeclared bodies retain ordinary views", () => {
    const bodyRenderer = vi.fn(() => null);
    const renderer = toolRenderer(contract, { input: { bodyRenderer, streaming: ({ args }) =>
      args !== null && typeof args === "object" && !Array.isArray(args) && typeof args.content === "string" && args.content.length > 0 } });
    expect(renderer.resolve(input)?.streaming).toBe(false);
    expect(renderer.resolve({ ...input, args: { content: "partial" } })?.streaming).toBe(true);
    expect(toolRenderer(contract, { input: { bodyRenderer } }).resolve({ ...input, args: { content: "partial" } })?.streaming).toBe(false);
    expect(bodyRenderer).not.toHaveBeenCalled();
  });

  // Declarations must use the same decoded data as the body; otherwise whitespace or invalid types in raw payloads may cause premature expansion or exceptions.
  it("execution declarations consume decoded results, and invalid payloads do not reach declarations", () => {
    const streaming = vi.fn(({ result }: { result: { data: { text: string } | null } | null }) => !!result?.data?.text);
    const renderer = toolRenderer(contract, { execution: { bodyRenderer: () => null, streaming } });
    const executing: ToolRenderProps = { ...input, phase: "executing", args: { content: "" },
      result: { kind: "running", data: { text: "   " } } };
    expect(renderer.resolve(executing)?.streaming).toBe(false);
    expect(renderer.resolve({ ...executing, result: { kind: "running", data: { text: " report " } } })?.streaming).toBe(true);
    expect(streaming.mock.lastCall?.[0].result?.data?.text).toBe("report");
    streaming.mockClear();
    expect(renderer.resolve({ ...executing, result: { kind: "running", data: { text: 7 } } })).toBeNull();
    expect(streaming).not.toHaveBeenCalled();
  });

  // Waiting and execution share an entry point, and objects can be reused across phases; phase dispatch must block declarations during waiting, after finalization, or without a body.
  it("waiting, finalized, and bodyless views do not trigger streaming or attention-required checks", () => {
    const streaming = vi.fn(() => true);
    const attention = vi.fn(() => true);
    const shared = { bodyRenderer: () => null, streaming, attention };
    const renderer = toolRenderer(contract, { execution: shared, result: shared });
    expect(renderer.resolve({ ...input, phase: "ready", args: { content: "" } })).toMatchObject({ streaming: false, attention: false });
    expect(renderer.resolve({ ...input, phase: "settled", args: { content: "" },
      result: { kind: "succeeded", data: { text: "saved" } } })).toMatchObject({ streaming: false, attention: false });
    expect(toolRenderer(contract, { input: { streaming } }).resolve(input)?.streaming).toBe(false);
    expect(toolRenderer(contract, { execution: { attention } }).resolve({ ...input, phase: "executing", args: { content: "" } })?.attention).toBe(false);
    expect(streaming).not.toHaveBeenCalled();
    expect(attention).not.toHaveBeenCalled();
    expect(renderer.resolve({ ...input, phase: "executing", args: { content: "" } })?.attention).toBe(true);
  });
});
