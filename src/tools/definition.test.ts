import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool, jsonSchema, type ToolInput } from "@asterism-app/sdk/contracts";
import { declareTool } from "./definition.ts";

function tool(argsSchema: z.ZodType<ToolInput>) {
  return defineTool({ id: "test.tools/sample", name: "sample", description: "Sample operation.", guidelines: [], argsSchema });
}

describe("JSON value schema", () => {
  it("accepts nested JSON and rejects values JSON cannot represent", () => {
    expect(jsonSchema.safeParse({ list: [1, null, "text", { flag: true }] }).success).toBe(true);
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, undefined, [undefined], { key: undefined }, new Date(0), new Map(), () => 1, 1n])
      expect(jsonSchema.safeParse(value).success).toBe(false);
  });
});

describe("Top-level parameter schema projection", () => {
  it("rejects constrained recursion with the tool name", () => {
    const node: z.ZodType<Exclude<ToolInput, null>> = z.strictObject({ label: z.string(), children: z.array(z.lazy(() => node)) }).describe("Tree node.");
    expect(() => declareTool(tool(node))).toThrow("Top-level tool sample has a parameter schema that cannot be projected inline");
  });

  it("rejects named schemas that would require a definition table", () => {
    const item = z.strictObject({ count: z.number() }).meta({ id: "item" });
    expect(() => declareTool(tool(z.strictObject({ first: item, second: item }).describe("Named inputs.")))).toThrow("Top-level tool sample has named parameter schemas: item");
  });
});
