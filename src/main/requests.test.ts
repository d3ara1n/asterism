import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeRequests } from "./requests.ts";
import { protocolVersion } from "../shared/contracts.ts";

afterEach(() => vi.useRealTimers());
// 主进程控制链路契约：退出确认等工作区请求按身份配对、断开时结算且不重放。
describe("主进程工作区请求生命周期", () => {
  it("按请求身份匹配响应，忽略未知响应", async () => {
    const sent: { id: string }[] = [];
    const requests = new RuntimeRequests(message => sent.push(message as { id: string }), () => {});
    const pending = requests.execute({ type: "workspace.read" });
    requests.receive({ kind: "response", version: protocolVersion, id: crypto.randomUUID(), result: { ok: false, error: { code: "other", message: "Other." } } });
    requests.receive({ kind: "response", version: protocolVersion, id: sent[0]!.id, result: { ok: false, error: { code: "not_found", message: "Missing task." } } });
    expect(await pending).toEqual({ ok: false, error: { code: "not_found", message: "Missing task." } });
    requests.close();
  });

  it("断开结算所有在途请求，后续命令不发送", async () => {
    const send = vi.fn();
    const requests = new RuntimeRequests(send, () => {});
    const first = requests.execute({ type: "workspace.read" });
    const second = requests.execute({ type: "workspace.read" });
    requests.close();
    expect((await first).ok).toBe(false);
    expect((await second).ok).toBe(false);
    expect((await requests.execute({ type: "workspace.read" })).ok).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
  });

});
