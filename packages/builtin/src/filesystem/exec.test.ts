import { mkdtempSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { ApplicationService } from "../../../../src/runtime/service.ts";
import * as runtimeModules from "../../../../src/runtime/builtin.ts";
import { AgentCapabilities } from "../../../../src/execution/capabilities.ts";
import { executeCoreBatch } from "../../../../src/execution/core.ts";
import type { Json, ToolOutcome } from "@atelier/sdk/contracts";
import { BuiltinSettings } from "../settings/contract.ts";

// docs/runtime.md：真实资源工具装配消费目录 cwd、空 target、profile 与结构化结果；命令可自行改变目录。
it("目录 exec 经真实工具入口执行，省略 target，cwd 不限制命令的路径操作", async () => {
  const root = mkdtempSync(join(tmpdir(), "atelier-exec-integration-"));
  const directory = join(root, "directory"), outside = join(root, "outside");
  mkdirSync(directory); mkdirSync(outside);
  let modules!: ReturnType<typeof runtimeModules.createModules>, app: ApplicationService | undefined;
  const createModules = runtimeModules.createModules;
  const capture = vi.spyOn(runtimeModules, "createModules").mockImplementation((...args) => {
    modules = createModules(...args); return modules;
  });
  try {
    app = new ApplicationService(join(root, "host"));
    capture.mockRestore();
    const settings = { ...BuiltinSettings.defaults, shell: { selected: "node", profiles: [
      { id: "node", name: "Test shell", executable: process.execPath, args: [], commandArgs: ["-e"], env: {} },
    ] } };
    app.configurePlugin({ type: "save", id: BuiltinSettings.plugin, value: settings });
    const resource = { id: "directory", kind: "atelier.builtin/directory", title: "Directory", data: { path: directory } };
    const sessionId = app.sessions.tree.create("Execution");
    app.sessions.tree.appendToTimeline(sessionId, { contract: "resource_created", source: null, recipient: null, model: null,
      data: { id: resource.id, type: resource.kind, title: resource.title, path: directory } });
    const caller = { ref: { sessionId, id: resource.id, kind: resource.kind }, title: resource.title };
    const capabilities = new AgentCapabilities(modules.resources, modules.tools, [resource], () => true, caller);
    const invoke = async (args: Json) => {
      const results: ToolOutcome[] = [];
      await executeCoreBatch([{ callId: "call", name: "resource_call", arguments: { resource_id: resource.id, tool: "exec", args } }],
        capabilities, new AbortController().signal, (_call, outcome) => results.push(outcome));
      return results[0]!;
    };
    const result = await invoke({ command: `console.log(process.cwd());process.chdir(${JSON.stringify(outside)});console.log(process.cwd())` });
    expect(result).toMatchObject({ kind: "succeeded", implementation: { id: "atelier.builtin/directory.exec" },
      data: { output: `${realpathSync(directory)}\n${realpathSync(outside)}\n`, exitCode: 0, truncation: null } });
    expect(result.model).toEqual([{ kind: "text", text: `${realpathSync(directory)}\n${realpathSync(outside)}\n` }]);
    expect(await invoke({ command: "console.log(process.cwd())" })).toMatchObject({
      kind: "succeeded", data: { output: `${realpathSync(directory)}\n` },
    });
    expect(await invoke({ command: "console.log('never')", timeout: 0 })).toMatchObject({ kind: "rejected" });
    // docs/runtime.md：非成功说明由公共工具层保留，输出投影不重复包装退出信息。
    expect(await invoke({ command: "console.log('failure output'); process.exitCode=7" })).toMatchObject({
      kind: "failed", model: [
        { kind: "text", text: "failed (command_failed): Command exited with code 7." },
        { kind: "text", text: "failure output\n" },
      ],
    });
    // docs/runtime.md：成功空输出保持为空，通过真实结果 schema，不添加占位正文。
    expect(await invoke({ command: "void 0" })).toMatchObject({
      kind: "succeeded", model: [{ kind: "text", text: "" }],
    });
  } finally {
    capture.mockRestore();
    await app?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
