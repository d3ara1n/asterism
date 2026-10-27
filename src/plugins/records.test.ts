import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineRecord, pluginNamespace, type SessionRecord } from "@asterism/sdk/contracts";
import { sessionSnapshot, sessionView } from "./records.ts";
import { nodeView } from "../session/view.ts";
import { attached, created, event, node, removed } from "../session/test-nodes.ts";
import { SessionTree } from "../session/tree.ts";
import { sessionSchemaSql } from "../session/schema.ts";
import { sessionNodeSchema } from "../shared/session.ts";

const databases: DatabaseSync[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const db of databases.splice(0)) db.close(); });
function stored() {
  const db = new DatabaseSync(":memory:"); databases.push(db);
  db.exec(sessionSchemaSql);
  const tree = new SessionTree(db);
  return { tree, sessionId: tree.create("Captured title") };
}

const contract = defineRecord("example.plugin/value", { schema: z.object({ value: z.number() }) });
const record: SessionRecord = { id: "r", sessionId: "s", parentId: null, sequence: 1, createdAt: "2026-10-11T00:00:00Z",
  contract: { id: contract.id }, source: { plugin: "example.plugin", resource: null }, data: { value: 1 }, context: null };
const value = (id: string, parentId: string | null, data: unknown, type = contract.id) =>
  node(id, parentId, event(type, data as never, { source: { plugin: "example.plugin", resource: null } }));

describe("Contract decoding on shared timelines", () => {
  // A new codec reads old payloads without migrating immutable records in place.
  it("decodes old and current payload shapes while preserving original record data", () => {
    const current = z.object({ text: z.string() });
    const schema = z.codec(z.union([z.string(), current]), current, {
      decode: value => typeof value === "string" ? { text: value } : value,
      encode: value => value,
    });
    const upgraded = defineRecord(contract.id, { schema });
    const old = { ...record, data: "old text" };
    expect(upgraded.decode(old)).toMatchObject({ status: "known", data: { text: "old text" }, record: { data: "old text" } });
    expect(old.data).toBe("old text");
    expect(upgraded.decode({ ...record, data: { text: "new text" } })).toMatchObject({ status: "known", data: { text: "new text" } });
  });
  it("decodes by domain identity and actual shape; schema-invalid data returns unknown while retaining original records", () => {
    expect(contract.decode({ ...record, contract: { id: "another.plugin/event" } })).toBeNull();
    expect(contract.decode(record)).toMatchObject({ status: "known", data: { value: 1 } });
    const invalid = { ...record, data: { value: "bad" } };
    expect(contract.decode(invalid)).toEqual({ status: "unknown", record: invalid, reason: "invalid_data" });
  });
  it("upgrade failures preserve original data and do not block other consumers reading the same envelope", () => {
    const next = defineRecord(contract.id, { schema: contract.schema.transform(data => {
      data.value = 99; throw new Error("Unknown legacy payload.");
    }) });
    expect(next.decode(record)).toEqual({ status: "unknown", record, reason: "invalid_data" });
    expect(record.data).toEqual({ value: 1 });
    expect(contract.decode(record)).toMatchObject({ status: "known", data: { value: 1 } });
  });
  it("typed first never skips corrupt records; generic reads still expose the full timeline and raw payloads", () => {
    const first = value("r", null, { value: "bad" }), second = value("r2", "r", { value: 2 });
    const view = sessionView(nodeView("s", "Timeline", [first, second], second.id));
    expect(view.records.first(contract, { scope: "timeline" })).toMatchObject({ status: "unknown", record: { id: "r" } });
    expect(view.records.query(contract, { scope: "session" }).map(decoded => decoded.status)).toEqual(["unknown", "known"]);
    expect(view.records.all({ scope: "session" }).map(record => record.data)).toEqual([{ value: "bad" }, { value: 2 }]);
    expect(() => { (view.records.all({ scope: "session" })[0]!.data as { value: string }).value = "changed"; }).toThrow();
  });
  it("opaque plugin payloads and origins pass through unchanged from envelopes without host field interpretation", () => {
    const opaque = { value: 7, future: { secret: "plugin-owned", items: [null, "resume"] } };
    const declared = defineRecord("example.plugin/opaque", { schema: z.json() });
    const saved = node("opaque", null, event(declared.id, opaque, {
      source: { plugin: "example.plugin", resource: { sessionId: "s", id: "resource", kind: "example.plugin/resource" } },
    }));
    const decoded = sessionView(nodeView("s", "", [saved], saved.id)).records.first(declared, { scope: "timeline" });
    expect(decoded).toMatchObject({ status: "known", data: opaque,
      record: { source: { plugin: "example.plugin", resource: { sessionId: "s", id: "resource", kind: "example.plugin/resource" } } } });
  });
  it("typed last decodes only range targets; the latest corrupt record never falls back and fixed snapshots ignore later appends", () => {
    const first = value("first", null, { value: 1 });
    const branch = value("branch", "first", { value: "bad" });
    const unrelated = Array.from({ length: 1000 }, (_, i) => value(`noise-${i}`, "first", { value: i }, "other/noise"));
    const nodes = [first, ...unrelated, branch];
    const view = sessionView(nodeView("s", "Timeline", nodes, first.id));
    const decode = vi.spyOn(contract, "decode");
    expect(view.records.last(contract, { scope: "session" })).toMatchObject({ status: "unknown", record: { id: "branch" } });
    expect(decode).toHaveBeenCalledTimes(1);
    expect(view.records.last(contract, { scope: "timeline" })).toMatchObject({ status: "known", data: { value: 1 } });
    expect(decode).toHaveBeenCalledTimes(2);
    expect(view.records.first(contract, { scope: "session" })).toMatchObject({ status: "known", record: { id: "first" } });
    expect(decode).toHaveBeenCalledTimes(3);
    expect(view.records.last(defineRecord("other.plugin/absent", { schema: z.json() }), { scope: "session" })).toBeNull();
    nodes.push(value("later", "first", { value: 3 }));
    expect(view.records.last(contract, { scope: "session" })?.record.id).toBe("branch");
    decode.mockRestore();
  });
  it("model-visible text and recipients enter envelope context while original event identity and payload remain", () => {
    const linked = node("event", null, attached("a", "directory", "A resource was linked."));
    expect(sessionView(nodeView("s", "", [linked], linked.id)).records.all({ scope: "timeline" })[0]).toMatchObject({
      contract: { id: "resource_attached" }, data: { id: "directory", receiverId: "a" },
      context: { text: "A resource was linked.", recipient: "a" },
    });
  });

  // Fixed snapshot contract: even if the first read follows appends, title overwrites, and forks, it sees only the captured position.
  it("deferred storage observation reads still fix paths, session bounds, titles, and resource presence", () => {
    const { tree, sessionId } = stored();
    const Resource = pluginNamespace("example.plugin").resource("item", z.object({}));
    const empty = sessionSnapshot(tree.view(sessionId));
    const first = tree.appendToTimeline(sessionId, event(contract.id, { value: 1 }));
    const object = tree.appendToTimeline(sessionId, created("item", "Item", Resource.kind));
    const before = sessionSnapshot(tree.view(sessionId));
    const old = tree.appendToTimeline(sessionId, removed("item"));
    const removedView = sessionSnapshot(tree.view(sessionId));
    tree.select(sessionId, first.id);
    const branch = tree.appendToTimeline(sessionId, event(contract.id, { value: 2 }));
    tree.setTitle(sessionId, "Current title");
    const current = sessionSnapshot(tree.view(sessionId));

    expect(empty.records.all({ scope: "session" })).toEqual([]);
    expect(empty.records.all({ scope: "timeline" })).toEqual([]);
    expect(empty.resources.all()).toEqual([]);
    expect(before.title).toBe("Captured title");
    expect(before.position.nodeId).toBe(object.id);
    expect(before.records.all({ scope: "timeline" }).map(record => record.id)).toEqual([first.id, object.id]);
    expect(before.records.all({ scope: "session" }).map(record => record.id)).toEqual([first.id, object.id]);
    expect(before.records.last(contract, { scope: "session" })).toMatchObject({ record: { id: first.id } });
    expect(before.resources.get(Resource, "item")).toMatchObject({ status: "known", resource: { title: "Item" } });
    expect(removedView.resources.get(Resource, "item")).toBeNull();
    expect(removedView.records.all({ scope: "timeline" }).map(record => record.id)).toEqual([first.id, object.id, old.id]);
    expect(current.resources.all()).toEqual([]);
    expect(current.records.query(contract, { scope: "timeline" }).map(record => record.record.id)).toEqual([first.id, branch.id]);
  });

  // A receiver's scope contains only explicit direct targets; incoming edges, transitive edges, and foreign identities cannot select it.
  it("queries direct resource links by the receiver's full identity", () => {
    const { tree, sessionId } = stored();
    const receiver = { sessionId, id: "bridge", kind: "example.plugin/bridge" };
    tree.appendToTimeline(sessionId, created(receiver.id, "Bridge", receiver.kind));
    tree.appendToTimeline(sessionId, created("agent", "Worker"));
    tree.appendToTimeline(sessionId, created("note", "Notes", "example.plugin/note"));
    tree.appendToTimeline(sessionId, created("incoming", "Incoming"));
    tree.appendToTimeline(sessionId, attached(receiver.id, "agent"));
    tree.appendToTimeline(sessionId, attached("agent", "note"));
    tree.appendToTimeline(sessionId, attached("incoming", receiver.id));
    const snapshot = sessionSnapshot(tree.view(sessionId));
    expect(snapshot.resources.linkedTo(receiver)).toEqual([
      { ref: { sessionId, id: "agent", kind: "asterism.builtin/agent" }, title: "Worker", data: {} },
    ]);
    expect(snapshot.resources.linkedTo({ ...receiver, sessionId: "other" })).toEqual([]);
    expect(snapshot.resources.linkedTo({ ...receiver, kind: "example.plugin/other" })).toEqual([]);
    expect(snapshot.resources.linkedTo({ ...receiver, id: "missing" })).toEqual([]);
    tree.appendToTimeline(sessionId, attached(receiver.id, "note"));
    expect(sessionSnapshot(tree.view(sessionId)).resources.linkedTo(receiver).map(resource => resource.ref.id)).toEqual(["agent", "note"]);
  });

  // Link queries share snapshot isolation: later detach/removal and cursor changes must not replace the captured path.
  it("keeps captured links and titles while new snapshots follow detach, removal, and branching", () => {
    const { tree, sessionId } = stored();
    const receiver = { sessionId, id: "bridge", kind: "example.plugin/bridge" };
    tree.appendToTimeline(sessionId, created(receiver.id, "Bridge", receiver.kind));
    tree.appendToTimeline(sessionId, created("agent", "Worker"));
    const linked = tree.appendToTimeline(sessionId, attached(receiver.id, "agent"));
    const before = sessionSnapshot(tree.view(sessionId));
    tree.appendToTimeline(sessionId, event("resource_renamed", { id: "agent", title: "Renamed" }));
    const renamed = sessionSnapshot(tree.view(sessionId));
    tree.appendToTimeline(sessionId, event("resource_detached", { id: "agent", receiverId: receiver.id }));
    expect(sessionSnapshot(tree.view(sessionId)).resources.linkedTo(receiver)).toEqual([]);

    tree.select(sessionId, linked.id);
    tree.appendToTimeline(sessionId, removed("agent"));
    expect(sessionSnapshot(tree.view(sessionId)).resources.linkedTo(receiver)).toEqual([]);
    tree.select(sessionId, linked.id);
    tree.appendToTimeline(sessionId, removed(receiver.id));
    expect(sessionSnapshot(tree.view(sessionId)).resources.linkedTo(receiver)).toEqual([]);

    tree.select(sessionId, linked.id);
    tree.appendToTimeline(sessionId, event("example.plugin/message", { text: "Another branch" }));
    expect(sessionSnapshot(tree.view(sessionId)).resources.linkedTo(receiver).map(resource => resource.title)).toEqual(["Worker"]);
    expect(before.resources.linkedTo(receiver).map(resource => resource.title)).toEqual(["Worker"]);
    expect(renamed.resources.linkedTo(receiver).map(resource => resource.title)).toEqual(["Renamed"]);
  });

  // Sequence numbers follow session append order, not cross-session database seq or current-path indices.
  it("interleaved appends to side branches and other sessions do not alter public record sequence numbers", () => {
    const { tree, sessionId } = stored();
    const other = tree.create("Other");
    tree.appendToTimeline(other, event(contract.id, { value: 0 }));
    const first = tree.appendToTimeline(sessionId, event(contract.id, { value: 1 }));
    const old = tree.appendToTimeline(sessionId, event(contract.id, { value: 2 }));
    tree.appendToTimeline(other, event(contract.id, { value: 0 }));
    tree.select(sessionId, first.id);
    const branch = tree.appendToTimeline(sessionId, event(contract.id, { value: 3 }));
    const view = sessionSnapshot(tree.view(sessionId));
    expect(view.records.all({ scope: "timeline" }).map(record => record.sequence)).toEqual([1, 3]);
    expect(view.records.all({ scope: "session" }).map(record => record.sequence)).toEqual([1, 2, 3]);
    expect(view.records.first(contract, { scope: "timeline" })?.record.sequence).toBe(1);
    expect(view.records.last(contract, { scope: "timeline" })?.record.sequence).toBe(3);
    expect(tree.sequences(sessionId, [first, old, branch])).toEqual([1, 2, 3]);
  });

  // Lazy-read contract: observation handles do not materialize history; typed queries parse only matching bodies, and corrupt tail records still return unknown.
  it("creating observation handles parses no nodes and first/last and typed queries materialize only selected records", () => {
    const { tree, sessionId } = stored();
    const first = tree.appendToTimeline(sessionId, event(contract.id, { value: 1 }));
    tree.appendToTimeline(sessionId, event("example.plugin/noise", { text: "Unrelated body" }));
    const last = tree.appendToTimeline(sessionId, event(contract.id, { value: "invalid" }));
    const parse = vi.spyOn(sessionNodeSchema, "parse");
    const view = sessionSnapshot(tree.view(sessionId));
    expect(parse).not.toHaveBeenCalled();
    expect(view.records.last(contract, { scope: "timeline" })).toMatchObject({ status: "unknown", record: { id: last.id } });
    expect(parse).toHaveBeenCalledTimes(1);
    parse.mockClear();
    expect(view.records.first(contract, { scope: "timeline" })).toMatchObject({ status: "known", record: { id: first.id } });
    expect(parse).toHaveBeenCalledTimes(1);
    parse.mockClear();
    expect(view.records.query(contract, { scope: "timeline" }).map(record => record.status)).toEqual(["known", "unknown"]);
    expect(parse).toHaveBeenCalledTimes(2);
  });
});
