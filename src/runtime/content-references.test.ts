import { describe, expect, it } from "vitest";
import { contentReferences } from "./content-store.ts";
import { schemaOf } from "../tools/definition.ts";
import { TerminalSee } from "../../packages/builtin/src/terminal/contract.ts";

describe("Content references in persisted JSON", () => {
  // resource_inspect screenshot result schemas define a same-name property; it is not an actual file reference.
  it("ContentRef field definitions in terminal tool catalogs can persist as ordinary JSON", () => {
    expect(contentReferences({ tools: [{ result: schemaOf(TerminalSee.schema) }] })).toEqual([]);
  });

  // Identify reserved values by complete shape; ordinary same-name fields can still contain real references, so scanning must continue.
  it("collects exact references only, traverses ordinary same-name fields, and deduplicates", () => {
    const ref = { "$asterism.content": "c8ded95c-2061-4bc3-8744-3efb7aa1eb69" };
    expect(contentReferences({
      schema: { "$asterism.content": { nested: [ref] } },
      text: JSON.stringify(ref),
      extra: { ...ref, description: "ordinary object" },
      invalid: { "$asterism.content": "not-a-uuid" },
      files: [ref],
    })).toEqual([ref]);
  });
});
