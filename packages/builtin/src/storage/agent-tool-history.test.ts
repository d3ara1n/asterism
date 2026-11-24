import { describe, expect, it } from "vitest";
import type { Json } from "@asterism-app/sdk/contracts";
import { agentToolHistoryStorage } from "./agent-tool-history.ts";

const migrate = agentToolHistoryStorage.migrations[1];
const execution = "asterism.builtin/agent.execution";
const toolExecution = "asterism.builtin/agent.tool-execution";

// Saved format before tagged inputs, independent of current schemas and writers.
const invocation = { resource: { id: "d", title: "Directory", kind: "asterism.builtin/directory" },
  implementation: { id: "asterism.builtin.directory.read" }, startedAt: 123 };
const call = {
  kind: "toolcall", callId: "call-1", name: "resource_call", responseId: "response-1", ordinal: 2,
  requestParentId: "request-parent", source: { model: "p/m", adapter: "test", scope: "scope" },
  complete: false, continuation: { signature: "retained" }, outcome: null, invocation,
  startedAt: 100, endedAt: 120,
};
const args = { resource_id: "d", target: { path: "notes.txt" }, tool: "read" };

function block(value: Json) { return { type: "block", block: value }; }

describe("Agent tool history migration from version 1 to 2", () => {
  it.each(["", '  {"path":"notes'])("preserves unfinished draft text %j without introducing parsed input", text => {
    const unfinished = { ...call, endedAt: null };
    expect(migrate(execution, block({ ...unfinished, arguments: null, argumentsText: text }))).toEqual(
      block({ ...unfinished, input: null, draft: { kind: "structured", text } }),
    );
  });

  it("retains a parsed JSON null as structured input rather than treating it as missing", () => {
    expect(migrate(execution, block({ ...call, arguments: null, argumentsText: null }))).toEqual(
      block({ ...call, input: { kind: "structured", value: null }, draft: null }),
    );
  });

  const outcome = { ...invocation, finishedAt: 456, kind: "failed", data: { arguments: ["result data"], argumentsText: null },
    model: [{ kind: "text", text: "Cannot read." }], error: { code: "read_failed", message: "Cannot read." } };

  it.each([{ state: "pending", output: null }, { state: "finalized", output: outcome }])(
    "changes only the saved tool input in a $state operation", ({ output }) => {
      const saved = Object.freeze({ input: Object.freeze({ ...call, arguments: args, argumentsText: null }), output });
      expect(migrate(toolExecution, saved)).toEqual({
        input: { ...call, input: { kind: "structured", value: args }, draft: null }, output,
      });
    },
  );

  it("leaves already-tagged rows alone in a mixed-format history", () => {
    const currentBlock = block({ ...call, input: { kind: "freeform", text: '  {"literal":true}\r\n' }, draft: null });
    const currentOperation = { input: { ...call, input: { kind: "structured", value: [null, false] }, draft: null }, output: outcome };
    expect(migrate(execution, currentBlock)).toBe(currentBlock);
    expect(migrate(toolExecution, currentOperation)).toBe(currentOperation);
  });

  it("leaves non-tool execution blocks alone", () => {
    const text = block({ kind: "text", responseId: "response-1", requestParentId: null, ordinal: 0,
      complete: true, continuation: null, source: call.source, text: 'Tool output: {"arguments":null}' });
    expect(migrate(execution, text)).toBe(text);
  });
});
