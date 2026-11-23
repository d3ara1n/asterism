import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resourceValidationMessage } from "./tool-validation.ts";

const argsSchema = z.strictObject({
  pattern: z.string(),
  limit: z.number().int().max(2000).optional(),
});
const targetSchema = z.strictObject({ path: z.string(), noIgnore: z.boolean().optional() }).nullable();

function describeInput(schema: z.ZodType, input: unknown, side: "args" | "target", otherSchema: z.ZodType): string {
  const result = schema.safeParse(input, { reportInput: true });
  if (result.success) throw new Error("Expected invalid input");
  return resourceValidationMessage(result.error, side, otherSchema);
}

describe("Resource tool validation feedback", () => {
  it("locates fields misplaced in either direction, including in a nullable schema", () => {
    expect(describeInput(argsSchema, { pattern: "*.md", noIgnore: true }, "args", targetSchema))
      .toMatch(/args\.noIgnore: .*target\.noIgnore/);
    expect(describeInput(targetSchema, { path: ".", pattern: "*.md" }, "target", argsSchema))
      .toMatch(/target\.pattern: .*args\.pattern/);
  });

  it("distinguishes a missing required field from a supplied null", () => {
    expect(describeInput(targetSchema, { noIgnore: true }, "target", argsSchema))
      .toMatch(/target\.path: Required field is missing/);
    expect(describeInput(targetSchema, { path: null }, "target", argsSchema))
      .toMatch(/target\.path: .*expected string, received null/);
  });

  it("preserves type, range, and enum details", () => {
    expect(describeInput(argsSchema, { pattern: "*.md", limit: "5" }, "args", targetSchema))
      .toMatch(/args\.limit: .*expected number, received string/);
    expect(describeInput(argsSchema, { pattern: "*.md", limit: 2001 }, "args", targetSchema))
      .toMatch(/args\.limit: .*<=2000/);
    const view = z.strictObject({ mode: z.enum(["files", "count"]) });
    expect(describeInput(view, { mode: "lines" }, "target", argsSchema))
      .toMatch(/target\.mode: .*"files".*"count"/);
  });

  it("identifies unknown fields without guessing a destination", () => {
    const message = describeInput(argsSchema, { pattern: "*.md", noIgnore: true, typo: true }, "args", targetSchema);
    expect(message).toMatch(/args\.typo: Unknown field/);
    expect(message).not.toContain("target.typo");
    const ambiguous = z.union([
      z.strictObject({ path: z.string() }),
      z.strictObject({ source: z.string(), noIgnore: z.boolean() }),
    ]);
    expect(describeInput(argsSchema, { pattern: "*.md", noIgnore: true }, "args", ambiguous))
      .not.toContain("target.noIgnore");
  });

  it("does not suggest relocating nested fields, including within a union branch", () => {
    const nested = z.strictObject({ query: z.union([z.strictObject({}), z.string()]) });
    const message = describeInput(nested, { query: { noIgnore: true } }, "args", targetSchema);
    expect(message).toMatch(/args\.query\.noIgnore: Unknown field/);
    expect(message).not.toContain("target.noIgnore");
  });
});
