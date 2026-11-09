import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineData, defineImplementation, defineResource, defineTool } from "@asterism-app/sdk/contracts";
import { ResourceRegistry } from "../resources/registry.ts";
import { ToolRegistry } from "../tools/registry.ts";
import { implement, toolCaller } from "../tools/testing.ts";
import { AgentCapabilities } from "./capabilities.ts";

const resource = { id: "sample", kind: "test/sample", title: "Sample", data: {} };
const contract = defineImplementation({
  ...defineData("test/sample.read", z.codec(
    z.strictObject({ stored: z.string() }),
    z.strictObject({ answer: z.string() }),
    { decode: value => ({ answer: value.stored }), encode: value => ({ stored: value.answer }) },
  ).describe("The sampled value.")),
  resource: defineResource(resource.kind, z.strictObject({})),
  tool: defineTool({
    id: "test/tools.read", name: "read", description: "Read a sampled value.",
    guidelines: ["Select an item."],
    argsSchema: z.strictObject({}).describe("No arguments."),
  }),
  targetSchema: z.strictObject({ item: z.string() }).describe("The selected item."),
  effect: "read", execution: "parallel",
});
const implementation = implement(contract, { async call() { return { kind: "succeeded", data: { answer: "sample" } }; } });
const capabilities = new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([implementation]), [resource], () => true, toolCaller);

describe("Resource inspection views", () => {
  it("selects guidance and schema fields independently, keeping result schemas opt-in", () => {
    const fields = {
      default: ["name", "implementation", "description", "guidelines", "args", "target"],
      prompt: ["name", "implementation", "description", "guidelines"],
      schema: ["name", "implementation", "args", "target", "result"],
    };
    for (const detail of [undefined, "default", "prompt", "schema"] as const) {
      const [tool] = capabilities.describe(resource.id, { detail });
      expect(Object.keys(tool as object).sort()).toEqual([...fields[detail ?? "default"]].sort());
    }
  });

  it("describes the encoded result data rather than the plugin's decoded values", () => {
    const [tool] = capabilities.describe(resource.id, { tools: ["read"], detail: "schema" });
    expect(tool).toMatchObject({
      result: { type: "object", properties: { stored: { type: "string" } }, required: ["stored"] },
    });
    expect(tool).not.toHaveProperty("result.properties.answer");
  });
});
