import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeRequests } from "./requests.ts";
import { protocolVersion } from "../shared/contracts.ts";

afterEach(() => vi.useRealTimers());
// Main-process control contract: workspace requests such as exit confirmation pair by identity, settle on disconnect, and are never replayed.
describe("Main-process workspace request lifetime", () => {
  it("matches responses by request identity and ignores unknown responses", async () => {
    const sent: { id: string }[] = [];
    const requests = new RuntimeRequests(message => sent.push(message as { id: string }), () => {});
    const pending = requests.execute({ type: "workspace.read" });
    requests.receive({ kind: "response", version: protocolVersion, id: crypto.randomUUID(), result: { ok: false, error: { code: "other", message: "Other." } } });
    requests.receive({ kind: "response", version: protocolVersion, id: sent[0]!.id, result: { ok: false, error: { code: "not_found", message: "Missing task." } } });
    expect(await pending).toEqual({ ok: false, error: { code: "not_found", message: "Missing task." } });
    requests.close();
  });

  it("disconnection settles all in-flight requests and subsequent commands are not sent", async () => {
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
