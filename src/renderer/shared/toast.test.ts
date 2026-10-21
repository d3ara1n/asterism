import { expect, it, vi } from "vitest";
import { operationSucceeded, toast } from "./toast";

// 工作台反馈归属：发起入口逐次消费操作失败，重复失败也独立提示，成功不制造错误通知。
it("操作回执直接产生临时提示，重复错误无需共享状态或清除步骤", () => {
  const notify = vi.spyOn(toast, "error").mockReturnValue("notification");
  try {
    expect(operationSucceeded({ ok: true })).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    const failure = { ok: false as const, error: { code: "model_unavailable", message: "Model unavailable.", display: "Choose an available model." } };
    expect(operationSucceeded(failure)).toBe(false);
    expect(operationSucceeded(failure)).toBe(false);
    expect(notify.mock.calls).toEqual([["Choose an available model."], ["Choose an available model."]]);
  } finally { notify.mockRestore(); }
});
