import { describe, expect, it } from "vitest";
import { descendantsIn } from "./process-tree.ts";

describe("进程树快照", () => {
  // npx／uvx 包装的实际服务器是孙进程；只回收直接子进程会遗留服务器。深层后代先于父进程结束，避免父进程补拉起子进程。
  it("收集多层后代并把深层后代排在父进程之前", () => {
    const table = " 10 1\n 20 10\n 30 20\n 40 10\n 50 99\n";
    expect(descendantsIn(table, 10)).toEqual([30, 20, 40]);
  });
  // Windows 进程表可能出现 pid 复用造成的父子环；遍历必须终止且不把 root 自身列为后代。
  it("父子环不导致无限遍历", () => {
    expect(descendantsIn("10 30\r\n20 10\r\n30 20\r\n", 10)).toEqual([30, 20]);
  });
});
