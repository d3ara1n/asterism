import { afterEach, describe, expect, it } from "vitest";
import { agentUI } from "./renderer.ts";

const scopes: AbortController[] = [];
const scope = () => { const value = new AbortController(); scopes.push(value); return value; };
afterEach(() => { for (const controller of scopes.splice(0)) controller.abort(); });
const Component = () => null;

describe("Agent UI 公共登记", () => {
  // 公共 API 契约：重复身份必须显式失败，旧清理不得移除同名的新登记。
  it("保留登记顺序并按登记实例释放，不覆盖同名贡献", () => {
    const first = scope(), second = scope();
    const remove = agentUI.register({ id: "example.ask/question", Component }, first);
    expect(() => agentUI.register({ id: "example.ask/question", Component }, second)).toThrow("Duplicate Agent UI");
    agentUI.register({ id: "example.todo/list", Component }, second);
    expect(agentUI.getSnapshot().map(entry => entry.id)).toEqual(["example.ask/question", "example.todo/list"]);
    remove();
    agentUI.register({ id: "example.ask/question", Component }, second);
    remove();
    first.abort();
    expect(agentUI.getSnapshot().map(entry => entry.id)).toEqual(["example.todo/list", "example.ask/question"]);
    second.abort();
    expect(agentUI.getSnapshot()).toEqual([]);
  });

  // prepare 失败／超时通过 signal 清理，迟到的初始化不得重新挂上 UI。
  it("取消释放贡献并通知订阅者，已取消的作用域拒绝登记", () => {
    const controller = scope();
    let observed = 0;
    const stop = agentUI.subscribe(() => { observed = agentUI.getSnapshot().length; });
    try {
      agentUI.register({ id: "example.ask/question", Component }, controller);
      expect(observed).toBe(1);
      controller.abort();
      expect(observed).toBe(0);
      expect(() => agentUI.register({ id: "example.ask/late", Component }, controller)).toThrow();
      expect(agentUI.getSnapshot()).toEqual([]);
    } finally { stop(); }
  });
});
