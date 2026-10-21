import { expect, it, vi } from "vitest";
import { toast } from "sonner";
import { agentUI } from "@atelier/builtin-api/renderer";
import { builtinRenderer } from "../../../packages/builtin/src/renderer";
import { AgentExecutionFeedback } from "../../../packages/builtin/src/agent/feedback";
import { preparePlugin } from "./startup";
import { EventClient } from "../../shared/event-client";
import type { EventFrame } from "../../shared/plugin-events";

// docs/workbench.md#agent-扩展界面：反馈订阅等待或失败均不改变内置工具栏的顺序与存续。
// 使用真实插件装配，捕获把订阅等待放回工具栏 prepare 或漏装反馈模块的回归。
it.each(["ready", "failed"] as const)("执行反馈订阅延迟后 %s，工具栏保持登记顺序并独立清理", async outcome => {
  let receive!: (frame: EventFrame) => void;
  let feedbackId: string | undefined;
  const events = new EventClient({
    onFrame(listener) { receive = listener; return () => {}; },
    send(control) {
      if (control.type !== "subscribe") return;
      if (control.contract === AgentExecutionFeedback.id) feedbackId = control.id;
      else queueMicrotask(() => receive({ type: "ready", id: control.id }));
    },
  });
  const lifetime = new AbortController();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const warning = vi.spyOn(toast, "warning").mockImplementation(() => "test-toast");
  const expected = ["atelier.builtin/agent.configuration", "atelier.builtin/agent.context", "atelier.builtin/usage.toolbar"];
  let prepared = false;
  const preparation = preparePlugin(builtinRenderer, events, lifetime.signal, 1000)
    .then(close => { prepared = true; return close; });
  try {
    await vi.waitFor(() => expect(feedbackId).toBeDefined());
    expect(prepared).toBe(false);
    expect(agentUI.getSnapshot().slice(0, 3).map(entry => entry.id)).toEqual(expected);
    if (outcome === "failed") {
      receive({ type: "closed", id: feedbackId!, end: { reason: "unavailable", message: "Feedback unavailable." } });
    } else {
      receive({ type: "ready", id: feedbackId! });
    }
    const close = await preparation;
    expect(agentUI.getSnapshot().slice(0, 3).map(entry => entry.id)).toEqual(expected);
    if (outcome === "failed") {
      expect(error).toHaveBeenCalledWith(expect.stringContaining("preparation failed"), expect.any(Error));
      expect(warning).not.toHaveBeenCalled();
    } else {
      receive({ type: "event", id: feedbackId!, event: {
        contract: { id: AgentExecutionFeedback.id }, emittedAt: new Date().toISOString(),
        source: { plugin: "atelier.builtin", resource: { sessionId: "session", id: "agent", kind: "atelier.builtin/agent" } },
        data: { code: "cancelled", message: "Execution was cancelled.", level: "warning" },
      } });
      await vi.waitFor(() => expect(warning).toHaveBeenCalledWith("Execution was cancelled."));
      expect(error).not.toHaveBeenCalled();
    }
    await close();
    expect(agentUI.getSnapshot()).toEqual([]);
  } finally {
    lifetime.abort();
    events.close();
    await preparation.then(close => close());
    error.mockRestore();
    warning.mockRestore();
  }
});
