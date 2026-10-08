import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigurationRequests, RuntimeRequests } from "./requests.ts";
import { configurationVersion } from "../shared/configuration.ts";

afterEach(() => vi.useRealTimers());
describe("任务进程请求生命周期", () => {
  it("配置请求使用独立响应类型，不接受工作台响应冒充", async () => {
    const sent: { id: string }[] = [];
    const requests = new ConfigurationRequests(message => sent.push(message as { id: string }), () => {});
    const pending = requests.execute({ type: "read" });
    const error = { ok: false as const, error: { code: "not_found", message: "Configuration unavailable." } };
    requests.receive({ kind: "response", version: 1, id: sent[0]!.id, result: error });
    requests.receive({ kind: "configuration.response", version: configurationVersion, id: sent[0]!.id, result: error });
    expect(await pending).toEqual(error);
    requests.close();
  });
  it("配置保存容纳系统凭据处理，不沿用工作台的 15 秒超时", async () => {
    vi.useFakeTimers();
    const sent: { id: string }[] = [];
    const timeout = vi.fn();
    const requests = new ConfigurationRequests(message => sent.push(message as { id: string }), timeout);
    const pending = requests.execute({ type: "read" });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(timeout).not.toHaveBeenCalled();
    requests.receive({ kind: "configuration.response", version: configurationVersion, id: sent[0]!.id, result: { ok: false, error: { code: "unavailable", message: "System protection is unavailable." } } });
    expect((await pending).ok).toBe(false);
    requests.close();
  });
  it("按请求身份匹配响应，忽略未知响应", async () => {
    const sent: { id: string }[] = [];
    const requests = new RuntimeRequests(message => sent.push(message as { id: string }), () => {});
    const pending = requests.execute({ type: "workspace.read" });
    requests.receive({ kind: "response", version: 1, id: sent[0]!.id, result: { ok: false, error: { code: "not_found", message: "Missing task." } } });
    expect(await pending).toEqual({ ok: false, error: { code: "not_found", message: "Missing task." } });
    requests.close();
  });

  it("断开结算所有在途请求，后续命令不发送", async () => {
    const send = vi.fn();
    const requests = new RuntimeRequests(send, () => {});
    const first = requests.execute({ type: "task.create", title: "Once" });
    const second = requests.execute({ type: "workspace.read" });
    requests.close();
    expect((await first).ok).toBe(false);
    expect((await second).ok).toBe(false);
    expect((await requests.execute({ type: "task.create", title: "Again" })).ok).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("超时关闭通道，不自动重放可能已提交的操作", async () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const timeout = vi.fn();
    const requests = new RuntimeRequests(send, timeout, 50);
    const result = requests.execute({ type: "task.create", title: "Only once" });
    await vi.advanceTimersByTimeAsync(50);
    expect((await result).ok).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(timeout).toHaveBeenCalledTimes(1);
  });
});
