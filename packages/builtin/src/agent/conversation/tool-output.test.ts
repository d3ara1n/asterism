import { describe, expect, it } from "vitest";
import type { ToolRenderProps } from "@atelier/sdk/renderer";
import { reference } from "@atelier/sdk/contracts";
import { AgentPeek, type PeekResult } from "../peek/contract";
import { DirectoryExec } from "../../filesystem/exec-contract";
import type { ExecResult } from "../../shell/contract";
import { initialToolDisclosure, advanceToolDisclosure } from "./tool-state";
import { advanceToolOutputDisclosure } from "./tool-output";
import { BuiltinSettings } from "../../settings/contract";

const preferences = BuiltinSettings.defaults;
const report: PeekResult = { snapshot: { nodeId: null, capturedAt: "", records: 0 }, phase: "writing", report: "Report",
  round: 1, requests: [], queries: [] };
const output: ExecResult = { output: "Output", truncation: null, shell: "sh", termination: "running",
  exitCode: null, signal: null, durationMs: 10 };
const examples: { name: string; live: ToolRenderProps; empty: ToolRenderProps }[] = [
  { name: "peek",
    live: { phase: "executing", name: "peek", args: {}, target: null,
      invocation: { implementation: reference(AgentPeek) }, result: { kind: "running", data: report } },
    empty: { phase: "executing", name: "peek", args: {}, target: null,
      invocation: { implementation: reference(AgentPeek) }, result: { kind: "running", data: { ...report, phase: "reading", report: "" } } } },
  { name: "exec",
    live: { phase: "executing", name: "exec", args: {}, target: null,
      invocation: { implementation: reference(DirectoryExec) }, result: { kind: "running", data: output } },
    empty: { phase: "executing", name: "exec", args: {}, target: null,
      invocation: { implementation: reference(DirectoryExec) }, result: { kind: "running", data: { ...output, output: "" } } } },
];

// docs/workbench.md：首段产出与终结应用同一对偏好；后续增量和历史挂载保留开合。
describe.each(examples)("$name 流式产出开合", ({ live, empty }) => {
  it("等待产出，首段展开；后续活动保留手动选择，终结只折叠一次", () => {
    const initial = initialToolDisclosure(false, preferences, false);
    expect(advanceToolOutputDisclosure(initial, empty, preferences)).toBe(initial);
    const writing = advanceToolOutputDisclosure(initial, live, preferences);
    expect(writing.open).toBe(true);
    const closed = { ...writing, open: false };
    const nextInput = advanceToolDisclosure(closed, false, preferences, false);
    expect(advanceToolOutputDisclosure(nextInput, live, preferences)).toBe(closed);
    expect(advanceToolOutputDisclosure(closed, empty, preferences)).toBe(closed);
    const settled: ToolRenderProps = { ...live, phase: "settled", result: { kind: "succeeded", data: live.result?.data ?? null } };
    const ended = advanceToolOutputDisclosure(writing, settled, preferences);
    expect(ended.open).toBe(false);
    const reopened = { ...ended, open: true };
    expect(advanceToolOutputDisclosure(reopened, settled, preferences)).toBe(reopened);
    expect(advanceToolOutputDisclosure(initial, settled, preferences).open).toBe(false);
    expect(advanceToolOutputDisclosure(writing, settled, { ...preferences, autoCollapse: false }).open).toBe(true);
    expect(advanceToolOutputDisclosure(initial, live, { ...preferences, autoExpand: false }).open).toBe(false);
  });

  it("取消也结束预览；其他实现的同形数据不触发内置预览", () => {
    const initial = initialToolDisclosure(false, preferences, false);
    const writing = advanceToolOutputDisclosure(initial, live, preferences);
    const cancelled: ToolRenderProps = { ...live, phase: "settled",
      result: { kind: "cancelled", data: live.result?.data ?? null, message: "Cancelled." } };
    expect(advanceToolOutputDisclosure(writing, cancelled, preferences).open).toBe(false);
    expect(advanceToolOutputDisclosure(initial, { ...live, invocation: { implementation: { id: "example/tool" } } }, preferences)).toBe(initial);
  });
});
