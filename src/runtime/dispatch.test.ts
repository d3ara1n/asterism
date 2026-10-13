import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationService } from "./service.ts";
import { dispatch, dispatchSession } from "./dispatch.ts";
import { protocolVersion } from "../shared/contracts.ts";
import { sessionVersion } from "../shared/session.ts";

const roots: string[] = [], services: ApplicationService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function setup() {
  const root = mkdtempSync(join(tmpdir(), "dispatch-contract-")); roots.push(root);
  const service = new ApplicationService(root); services.push(service);
  return service;
}

// 预期来自独立 IPC 通道契约：非法信封不执行，应用列表不消费会话身份与执行位置。
describe("运行时 IPC 校验", () => {
  it("应用通道拒绝夹带会话位置，合法读取只返回列表", () => {
    const service = setup(), execute = vi.spyOn(service, "execute");
    expect(dispatch(service, { version: protocolVersion, id: randomUUID(), command: { type: "workspace.read", session_id: randomUUID() } })).toBeNull();
    expect(execute).not.toHaveBeenCalled();
    expect(service.execute({ type: "workspace.read" })).not.toHaveProperty("session");
  });

  it("会话通道先拒绝非法命令，再执行合法读取并交付当前执行位置", async () => {
    const service = setup(), sessionId = service.sessions.tree.create("IPC");
    const execute = vi.spyOn(service.sessions, "execute");
    const request = { kind: "session.request", version: sessionVersion, id: randomUUID(),
      command: { type: "read", sessionId } };
    expect(await dispatchSession(service, { ...request, command: { ...request.command, extra: true } })).toBeNull();
    expect(await dispatchSession(service, { ...request, command: { ...request.command, position: { kind: "history", nodeId: null } } })).toBeNull();
    expect(execute).not.toHaveBeenCalled();
    expect(await dispatchSession(service, request)).toMatchObject({ result: { ok: true, reply: { kind: "view", snapshot: { cursor: null } } } });
  });
});
