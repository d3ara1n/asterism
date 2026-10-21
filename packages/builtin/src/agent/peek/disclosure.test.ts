import { describe, expect, it } from "vitest";
import type { ToolRenderProps } from "@atelier/sdk/renderer";
import { reference } from "@atelier/sdk/contracts";
import { AgentPeek, type PeekResult } from "./contract";
import { advancePeekDisclosure } from "./disclosure";
import { initialToolDisclosure } from "../conversation/tool-state";
import { BuiltinSettings } from "../../settings/contract";

const preferences = { toolInputAutoExpand: true, toolInputAutoCollapse: true, peekAutoExpand: true, peekAutoCollapse: true };
const data: PeekResult = { snapshot: { nodeId: null, capturedAt: "", records: 0 }, phase: "writing", report: "Report",
  round: 1, requests: [], queries: [] };
const live: ToolRenderProps = { phase: "executing", name: "peek", args: { question: "Question" }, target: null,
  invocation: { implementation: reference(AgentPeek) }, result: { kind: "running", data } };
const settled: ToolRenderProps = { ...live, phase: "settled", result: { kind: "succeeded", data } };

// docs/workbench.md：自动开合只发生在首段报告与终结边界，历史和增量不覆盖用户选择。
describe("peek 报告开合", () => {
  it("首段报告展开，后续检索与增量保留手动选择，终结只折叠一次", () => {
    const initial = initialToolDisclosure(false, preferences, false);
    const writing = advancePeekDisclosure(initial, live, preferences);
    expect(writing.open).toBe(true);
    const closed = { ...writing, open: false };
    expect(advancePeekDisclosure(closed, live, preferences)).toBe(closed);
    expect(advancePeekDisclosure(closed, { ...live, result: { kind: "running", data: { ...data, phase: "reading", report: "" } } }, preferences)).toBe(closed);
    const ended = advancePeekDisclosure(writing, settled, preferences);
    expect(ended.open).toBe(false);
    const reopened = { ...ended, open: true };
    expect(advancePeekDisclosure(reopened, settled, preferences)).toBe(reopened);
    expect(advancePeekDisclosure(initial, settled, preferences).open).toBe(false);
    expect(advancePeekDisclosure(writing, settled, { ...preferences, peekAutoCollapse: false }).open).toBe(true);
    expect(advancePeekDisclosure(initial, live, { ...preferences, peekAutoExpand: false }).open).toBe(false);
  });

  it("旧配置保留原有偏好并补齐报告偏好，其他工具不应用 peek 规则", () => {
    expect(BuiltinSettings.schema.parse({ thinkingAutoExpand: false, thinkingAutoCollapse: true,
      toolInputAutoExpand: false, toolInputAutoCollapse: true })).toMatchObject({ thinkingAutoExpand: false, peekAutoExpand: true, peekAutoCollapse: true });
    const initial = initialToolDisclosure(false, preferences, false);
    expect(advancePeekDisclosure(initial, { ...live, invocation: { implementation: { id: "example/peek" } } }, preferences)).toBe(initial);
  });
});
