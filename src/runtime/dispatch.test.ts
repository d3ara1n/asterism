import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationService } from "./service.ts";
import { dispatch, serveSession } from "./dispatch.ts";
import { protocolVersion } from "../shared/contracts.ts";

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

// IPC validates envelopes only; domain services validate commands and deliver errors, while application lists do not consume session identity or execution position.
describe("Runtime IPC validation", () => {
  it("application channels reject embedded session positions and valid reads return only the list", () => {
    const service = setup();
    expect(dispatch(service, { version: protocolVersion, id: randomUUID(), command: { type: "workspace.read", session_id: randomUUID() } }))
      .toMatchObject({ result: { ok: false, error: { code: "invalid_request" } } });
    expect(service.execute({ type: "workspace.read" })).not.toHaveProperty("session");
  });

  it("session channels reject invalid commands before executing valid reads and delivering current execution positions", async () => {
    const service = setup(), sessionId = service.sessions.tree.create("IPC");
    const command = { type: "read", sessionId };
    expect(await serveSession(service, { ...command, extra: true })).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(await serveSession(service, { ...command, position: { kind: "history", nodeId: null } }))
      .toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(await serveSession(service, command)).toMatchObject({ ok: true, reply: { kind: "view", data: { cursor: null } } });
  });
});
