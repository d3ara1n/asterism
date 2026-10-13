import { describe, expect, it, vi } from "vitest";
import { prepareModules } from "./startup";

const base = { resources: [], cards: [], tools: [] };

describe("模块启动准备", () => {
  it("失败与超时不阻止启动，超时通知模块停止", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    const done = vi.fn(async () => {});
    await prepareModules([
      { ...base, prepare: async () => { throw new Error("boom"); } },
      { ...base, prepare: context => { signal = context.signal; return new Promise(() => {}); } },
      { ...base, prepare: done },
      base,
    ], 20);
    expect(done).toHaveBeenCalled();
    expect(signal?.aborted).toBe(true);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
