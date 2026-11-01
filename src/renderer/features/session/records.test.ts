import { describe, expect, it } from "vitest";
import { SessionRecordStore } from "./records";
import { nodeInfo } from "../../../session/view";
import { event, node } from "../../../session/test-nodes";
import type { SessionBridge, SessionNode } from "../../../shared/session";

function fixture(nodes: SessionNode[]) {
  const requests: string[][] = [];
  let failed = false;
  const stored = new Map(nodes.map(node => [node.id, node]));
  const bridge: SessionBridge = {
    async execute(command) {
      if (command.type !== "records.read") throw new Error("Unexpected command.");
      requests.push(command.ids);
      if (failed) return { ok: false, error: { code: "unavailable", message: "Read failed" } };
      return { ok: true, reply: { kind: "records", nodes: command.ids.map(id => stored.get(id)!) } };
    },
    onChanged: () => () => {},
  };
  const store = new SessionRecordStore(bridge, "s");
  const snapshot = (values = [...stored.values()], cursor = values.at(-1)?.id ?? null) => store.snapshot({
    sessionId: "s", title: "Session", cursor, nodes: values.map((node, index) => nodeInfo(node, index + 1)),
    pending: values.filter(node => node.pending),
  });
  return { store, stored, snapshot, requests, fail: (value: boolean) => { failed = value; } };
}

describe("Remote record observations", () => {
  // Cancelling one view must end its observation without cancelling another view sharing the same transport batch.
  it("cancels a reader independently of another reader of the same body", async () => {
    const f = fixture([node("a", null, event("test/body", "Saved"))]), snapshot = f.snapshot();
    const controller = new AbortController();
    const cancelled = snapshot.records.all({ scope: "session" }, { signal: controller.signal });
    const retained = snapshot.records.all({ scope: "timeline" });
    controller.abort(new Error("View closed"));
    await expect(cancelled).rejects.toThrow("View closed");
    expect((await retained)[0]?.data).toBe("Saved");
    expect(f.requests).toEqual([["a"]]);
  });
  // Independently mounted views must neither fetch nor own duplicate finalized bodies.
  it("shares bodies across concurrent readers and snapshots while keeping the complete metadata tree", async () => {
    const f = fixture([node("a", null, event("test/body", { text: "First" })), node("b", "a", event("test/body", { text: "Second" })),
      node("fork", "a", event("test/body", { text: "Other branch" }))]);
    const snapshot = f.snapshot(undefined, "b");
    expect(snapshot.records.index({ scope: "session" }).map(info => info.id)).toEqual(["a", "b", "fork"]);
    expect(f.requests).toEqual([]);
    const [first, second] = await Promise.all([
      snapshot.records.all({ scope: "timeline", from: "b" }),
      snapshot.records.all({ scope: "session", ids: ["b"] }),
    ]);
    expect(f.requests).toEqual([["b"]]);
    expect(first[0]).toBe(second[0]);
    expect((await f.snapshot().records.all({ scope: "session", ids: ["b"] }))[0]).toBe(first[0]);
    expect(snapshot.records.index({ scope: "timeline" }).map(info => info.id)).toEqual(["a", "b"]);
    await expect(snapshot.records.all({ scope: "timeline", from: "fork" })).rejects.toThrow("outside the selected scope");
  });

  // An operation may complete before the first body read of its old snapshot.
  it("retains the captured pending body after completion without poisoning finalized body sharing", async () => {
    const pending = node("operation", null, { ...event("test/operation", { input: "Question", output: null }), pending: true });
    const f = fixture([pending]), old = f.snapshot();
    f.stored.set(pending.id, { ...pending, pending: false, data: { input: "Question", output: "Answer" } });
    const current = f.snapshot();
    expect((await current.records.all({ scope: "timeline" }))[0]).toMatchObject({ pending: false, data: { output: "Answer" } });
    expect((await old.records.all({ scope: "timeline" }))[0]).toMatchObject({ pending: true, data: { output: null } });
    expect(old.records.index({ scope: "timeline" })[0]?.pending).toBe(true);
    expect(f.requests).toEqual([["operation"]]);
  });

  // A failed transfer is not an empty query and must not leave a permanently rejected cache entry.
  it("exposes read failure and permits a subsequent read to retry", async () => {
    const f = fixture([node("a", null, event("test/body", "Saved"))]), snapshot = f.snapshot();
    f.fail(true);
    await expect(snapshot.records.all({ scope: "session" })).rejects.toThrow("Read failed");
    f.fail(false);
    expect((await snapshot.records.all({ scope: "session" }))[0]?.data).toBe("Saved");
    expect(f.requests).toEqual([["a"], ["a"]]);
  });
});
