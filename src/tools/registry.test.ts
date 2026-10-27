import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineImplementation, defineResource, defineTool } from "@asterism-app/sdk/contracts";
import { defineData } from "@asterism-app/sdk/contracts";
import { implement, toolCaller } from "./testing.ts";
import { declareTool, projectTool } from "./definition.ts";
import { ToolRegistry } from "./registry.ts";

const Sample = defineTool({
  id: "test.tools/sample", name: "sample",
  description: "Obtain a sample from the selected target.",
  guidelines: ["Select the target using its implementation schema."],
  argsSchema: z.strictObject({}).describe("No operation parameters."),
});
const TextSample = defineImplementation({
  ...defineData("test.text.sample", z.strictObject({ text: z.string() }).describe("The sampled text.")),
  resource: defineResource("text", z.strictObject({})), tool: Sample,
  targetSchema: z.null().describe("Sample the whole text resource."), effect: "read", execution: "parallel",
});
const CollectionSample = defineImplementation({
  ...defineData("test.collection.sample", z.strictObject({ item: z.string(), text: z.string() }).describe("The sampled item and its text.")),
  resource: defineResource("collection", z.strictObject({})), tool: Sample,
  targetSchema: z.strictObject({ item: z.string() }).describe("Select one item in the collection."), effect: "read", execution: "parallel",
});

describe("Tool definition and implementation registration boundaries", () => {
  const text = implement(TextSample, { async call() { return { kind: "succeeded", data: { text: "sample" } }; } });
  const collection = implement(CollectionSample, { async call() { return { kind: "succeeded", data: { item: "a", text: "sample" } }; } });

  it("tools share complete definitions while implementations define target and result separately", () => {
    expect(TextSample.tool).toBe(Sample);
    expect(CollectionSample.tool).toBe(Sample);
    expect(() => new ToolRegistry([text, collection])).not.toThrow();
    expect(TextSample.targetSchema.safeParse({ item: "a" }).success).toBe(false);
    expect(CollectionSample.targetSchema.safeParse(null).success).toBe(false);
  });

  it("rejects duplicate support relationships and implementation identities", () => {
    expect(() => new ToolRegistry([text, text])).toThrow();
    expect(() => new ToolRegistry([text, { ...collection, reference: text.reference }])).toThrow();
    expect(() => new ToolRegistry([text, { ...collection, resourceKind: "text" }])).toThrow();
  });

  it("shares actual declaration objects and rejects independent copies even with identical IDs", () => {
    const copy = defineTool({ ...Sample, argsSchema: z.strictObject({}).describe("No operation parameters.") });
    expect(copy).not.toBe(Sample);
    expect(() => new ToolRegistry([text, { ...collection, tool: copy }])).toThrow();
    for (const tool of [
      defineTool({ ...Sample, id: "test.tools/other" }),
    ]) expect(() => new ToolRegistry([text, { ...collection, tool }])).toThrow();
  });

  it("requires overall descriptions for args, target, and result at declaration", () => {
    expect(() => defineTool({ ...Sample, argsSchema: z.strictObject({}) })).toThrow("sample.args");
    expect(() => defineImplementation({ ...TextSample, targetSchema: z.null() })).toThrow("test.text.sample.target");
    expect(() => defineImplementation({ ...TextSample, schema: z.strictObject({ text: z.string() }) })).toThrow("test.text.sample.result");
  });

  it("both model projection layers preserve definition guidance and parameter field descriptions", () => {
    const Find = defineTool({
      id: "test.tools/find", name: "find", description: "Find matching items.", guidelines: ["Supply a query before searching."],
      argsSchema: z.strictObject({ query: z.string().describe("The text to match.") }).describe("Search parameters."),
    });
    const resourceDefinition = projectTool(Find);
    expect(resourceDefinition).toMatchObject({
      description: "Find matching items.", guidelines: ["Supply a query before searching."],
      args: { description: "Search parameters.", properties: { query: { description: "The text to match." } } },
    });
    const declaration = declareTool(Find);
    expect(declaration).toMatchObject({ name: "find", parameters: resourceDefinition.args });
    expect(declaration.description).toContain(Find.description);
    expect(declaration.description).toContain(Find.guidelines[0]);
    expect(declareTool(defineTool({ ...Find, guidelines: [] })).description).toBe("Find matching items.");
  });

  it("target can locate blocks and handlers receive typed arguments with validated output", async () => {
    const contract = defineImplementation({
      ...defineData("test.game.move", z.strictObject({ x: z.number().nonnegative(), piece: z.string() }).describe("The moved piece and its new position.")),
      resource: defineResource("game", z.object({ origin: z.number() })),
      tool: defineTool({ id: "test.tools/move", name: "move", description: "Move a piece.", guidelines: ["Supply a displacement."],
        argsSchema: z.strictObject({ delta: z.number().describe("Displacement from the origin.") }).describe("Movement parameters.") }),
      targetSchema: z.strictObject({ piece: z.string().describe("The piece identifier.") }).describe("Select a piece on the board."),
      effect: "write", execution: "sequential",
    });
    const implementation = implement(contract, {
      async call(state, target, args) {
        return { kind: "succeeded", data: { x: state.origin + args.delta, piece: target.piece } };
      },
      toModel: result => `Moved ${result.piece} to ${result.x}`,
    });
    const resource = { id: "game", kind: "game", title: "Game", data: { origin: 2 } };
    const invoke = (delta: number) => {
      const prepared = implementation.prepare(resource, { piece: "T" }, { delta }, toolCaller);
      if (!("execute" in prepared)) throw new Error("Valid arguments were rejected.");
      return prepared.execute(new AbortController().signal);
    };
    expect(await invoke(1)).toMatchObject({ kind: "succeeded", data: { x: 3, piece: "T" } });
    expect(implementation.prepare(resource, { path: "T" }, { delta: 1 }, toolCaller)).toMatchObject({ kind: "rejected" });
    expect(implementation.prepare(resource, { piece: "T" }, { delta: "1" }, toolCaller)).toMatchObject({ kind: "rejected" });
    expect(implementation.prepare({ ...resource, data: {} }, { piece: "T" }, { delta: 1 }, toolCaller)).toMatchObject({ kind: "failed" });
    // TypeScript number cannot express nonnegative ranges; return values must still pass runtime contracts.
    await expect(invoke(-3)).rejects.toThrow();
  });
});
