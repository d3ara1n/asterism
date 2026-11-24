import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineImplementation, defineTool, pluginNamespace, type Json, type ToolCallInput, type ToolOutcome } from "@asterism-app/sdk/contracts";
import { defineModule, definePlugin, defineTopLevelTool, implementResource, implementTool } from "@asterism-app/sdk/runtime";
import { RunLifecycle } from "../plugins/lifecycle.ts";
import { loadPlugins } from "../plugins/loader.ts";
import type { SdkContext } from "../plugins/sdk-context.ts";
import { testHostServices } from "../plugins/testing.ts";
import { bindTopLevelTools, type BoundTopLevelTool } from "../plugins/top-level-tools.ts";
import { ResourceInspectResult, ResourceScriptResult } from "../tools/core.ts";
import { toolCaller } from "../tools/testing.ts";
import { AgentCapabilities, type ToolPolicy } from "./capabilities.ts";
import { bindModelTools, executeCoreBatch } from "./core.ts";

const ns = pluginNamespace("test.freeform");
const document = ns.resource("document", z.strictObject({ text: z.string() }));
const resource = { id: "doc", kind: document.kind, title: "Test document", data: { text: "Before\nOLD\nAfter\n" } };
const patch = defineImplementation({
  ...ns.data("patch", z.string().describe("The resulting text.")), resource: document,
  tool: defineTool({ id: ns.id + "/patch-text", name: "patch", kind: "freeform", description: "Preview a replacement patch.",
    guidelines: ["The first line is the text to replace. The rest is the replacement."] }),
  effect: "read", execution: "sequential",
});
const show = defineImplementation({
  ...ns.data("show", z.string().describe("The document text.")), resource: document,
  tool: defineTool({ id: ns.id + "/show-document", name: "show", description: "Show the document.", guidelines: [],
    argsSchema: z.strictObject({}).describe("No arguments.") }),
  targetSchema: z.null().describe("The entire document."), effect: "read", execution: "parallel",
});
const plugin = definePlugin({ namespace: ns, modules: [defineModule(() => ({
  resources: [implementResource(document, ns.data("view", z.null()), { project: () => null, inspect: async () => null })],
  tools: [implementTool(patch, { async call(state, input, { publish }) {
    const divider = input.indexOf("\n");
    const needle = input.slice(0, divider);
    if (divider < 1 || !state.text.includes(needle)) return { kind: "rejected", error: { code: "patch_mismatch", message: "The patch does not match." } };
    const updated = state.text.replace(needle, () => input.slice(divider + 1));
    publish(updated);
    return { kind: "succeeded", data: updated };
  } }), implementTool(show, { async call(state) { return { kind: "succeeded", data: state.text }; } })],
}))] });

const text = (input: string): ToolCallInput => ({ kind: "freeform", text: input });
const structured = (value: Json): ToolCallInput => ({ kind: "structured", value });
async function fixture(test: (scope: (policy?: ToolPolicy, linked?: boolean, allowResource?: boolean) => AgentCapabilities) => Promise<void>) {
  const modules = loadPlugins([plugin], testHostServices({
    refOf: id => id === resource.id ? { sessionId: toolCaller.ref.sessionId, id, kind: resource.kind } : null,
  }));
  try {
    await test((policy = () => true, linked = true, allowResource = true) =>
      new AgentCapabilities(modules.resources, modules.tools, linked ? [resource] : [], policy, toolCaller, true, () => allowResource));
  } finally { await modules.close(); }
}
async function invoke(cap: AgentCapabilities, name: string, input: ToolCallInput, tools: BoundTopLevelTool[] = []) {
  let settled: ToolOutcome | undefined;
  const progress: Json[] = [];
  await executeCoreBatch([{ callId: "call", name, input }], cap, new AbortController().signal,
    (_call, outcome) => { settled = outcome; }, { published(_call, data) { progress.push(data); } }, undefined, tools);
  return { result: settled!, progress };
}

const body = 'OLD\n  literal "quotes"\\ and CRLF\r\n你好\0suffix\r\n\r\n';
const updated = 'Before\n  literal "quotes"\\ and CRLF\r\n你好\0suffix\r\n\r\n\nAfter\n';

describe("Freeform tool dispatch", () => {
  it("rejects a freeform name that cannot be addressed by the resource header", () => {
    expect(() => defineTool({ ...patch.tool, name: "apply patch" })).toThrow("must be a single token");
  });

  it("routes a patch after either header line ending without changing the replacement or settling output early", () => fixture(async scope => {
    const cap = scope(), model = bindModelTools(cap);
    // A streamed draft may not yet have a complete route, even if the two names are already present.
    expect(model.preview?.("resource_call_text", text("doc patch"))).toEqual({});
    for (const newline of ["\n", "\r\n"]) {
      const input = text(`doc patch${newline}${body}`);
      expect(model.preview?.("resource_call_text", input)).toMatchObject({ resource: { id: "doc" }, implementation: { id: patch.id } });
      const { result, progress } = await invoke(cap, "resource_call_text", input);
      expect(result).toMatchObject({ kind: "succeeded", data: updated });
      expect(progress).toEqual([updated]);
    }
    // A terminated header with no body reaches the plugin; an unterminated header does not.
    expect((await invoke(cap, "resource_call_text", text("doc patch\n"))).result).toMatchObject({ error: { code: "patch_mismatch" } });
    for (const header of ["doc patch", "doc patch\r", "doc  patch\n", "doc patch extra\n"]) {
      expect((await invoke(cap, "resource_call_text", text(header))).result).toMatchObject({ kind: "rejected", error: { code: "invalid_arguments" } });
    }
  }));

  it("discovers freeform tools without input schemas and rejects calls that use the other format", () => fixture(async scope => {
    const cap = scope();
    for (const detail of ["default", "schema"]) {
      const { result } = await invoke(cap, "resource_inspect", structured({ resource_id: resource.id, detail }));
      const items = ResourceInspectResult.schema.parse(result.data).tools;
      const freeform = items.find(tool => tool.name === "patch");
      expect(freeform).toMatchObject({ kind: "freeform" });
      expect(freeform).not.toHaveProperty("args");
      expect(freeform).not.toHaveProperty("target");
      expect(items.find(tool => tool.name === "show")).toMatchObject({ kind: "structured", args: { type: "object" }, target: { type: "null" } });
    }
    for (const [name, input] of [["resource_call", structured({ resource_id: "doc", tool: "patch" })],
      ["resource_call_text", text("doc show\n")], ["resource_call_text", structured({ resource_id: "doc", tool: "patch" })]] as const) {
      expect((await invoke(cap, name, input)).result).toMatchObject({ kind: "rejected", error: { code: "invalid_arguments" } });
    }
  }));

  it("enforces captured link, tool and resource policies on text calls and script handles", () => fixture(async scope => {
    for (const [cap, code] of [[scope(undefined, false), "access_denied"], [scope(() => false), "tool_unavailable"],
      [scope(undefined, true, false), "access_denied"]] as const) {
      const direct = await invoke(cap, "resource_call_text", text(`doc patch\n${body}`));
      expect(direct.result).toMatchObject({ kind: "rejected", error: { code } });
      const script = await invoke(cap, "resource_script", structured({ code: `return (await resources.get("doc").patch(${JSON.stringify(body)})).error.code;` }));
      expect(ResourceScriptResult.schema.parse(script.result.data).value).toBe(code);
    }
  }));

  it("accepts text through script bindings without letting a handle token supply another route", () => fixture(async scope => {
    const cap = scope();
    const echo = defineTopLevelTool({ id: ns.id + "/echo", kind: "freeform", name: "echo_text", description: "Echo text.", guidelines: [],
      resultSchema: z.string().describe("Text to echo."), effect: "read", execution: "parallel",
      async execute(input) { return { kind: "succeeded", data: input }; },
    });
    const sdk = { reader: () => undefined, toolSession: () => undefined } as unknown as SdkContext;
    const tools = bindTopLevelTools([{ tool: echo, sdk, runs: new RunLifecycle(() => {}).group("tool") }], toolCaller, () => true, [], true, () => null);
    expect(bindModelTools(cap, tools).declarations.find(tool => tool.name === echo.name)).not.toHaveProperty("parameters");
    expect((await invoke(cap, echo.name, text(body), tools)).result).toMatchObject({ kind: "succeeded", data: body });
    const script = await invoke(cap, "resource_script", structured({ code: `
      const body = ${JSON.stringify(body)};
      const patch = await resources.get("doc").patch(body);
      const echo = await tools.echo_text(body);
      const invalid = await resources.get("doc patch\\nOLD\\n").show(body);
      return [patch.data, echo.data, invalid.error.code];
    ` }), tools);
    const saved = ResourceScriptResult.schema.parse(script.result.data);
    expect(saved.value).toEqual([updated, body, "invalid_arguments"]);
    expect(saved.calls[0]).toMatchObject({ tool: "patch", kind: "succeeded", implementation: { id: patch.id } });
  }));
});
