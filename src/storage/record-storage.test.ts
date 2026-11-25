import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import type { Json } from "@asterism-app/sdk/contracts";
import type { PluginRecordStorageDeclaration } from "@asterism-app/sdk/runtime";
import { messagingHistoryStorage } from "../../packages/builtin/src/storage/messaging.ts";
import { ChatMessageSent } from "../../packages/builtin/src/messaging/contract.ts";
import { agentToolHistoryStorage } from "../../packages/builtin/src/storage/agent-tool-history.ts";
import { SessionTree } from "../session/tree.ts";
import { openDatabase } from "../runtime/storage.ts";
import { workspaceStorage } from "./migrations/workspace.ts";
import { pluginStorages } from "./application.ts";
import { listRecoveryPoints, prepareData, recoveryPointDirectory } from "./preparation.ts";
import { initializePluginRecordStorage } from "./record-storage.ts";

const roots: string[] = [];
function setup() {
  const root = mkdtempSync(join(tmpdir(), "asterism-record-storage-"));
  roots.push(root);
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true }); });

const owner = "test.notes";
const contract = `${owner}/entry`;
const declaration: PluginRecordStorageDeclaration = {
  kind: "records", id: "history", contracts: [contract], version: 2,
  migrations: { 1: (_contract, data) => ({ input: data }) },
};
function prepare(root: string, storage: PluginRecordStorageDeclaration | null = declaration, pluginId = owner) {
  return prepareData(root, {
    version: "test", stores: [workspaceStorage(root)], paths: [{ path: "db" }],
    discover: async () => {
      try { return [{ id: pluginId, stores: pluginStorages(root, pluginId, storage ? [storage] : []) }]; }
      catch (error) { return [{ id: pluginId, stores: [], error: (error as Error).message }]; }
    },
  });
}
function add(tree: SessionTree, sessionId: string, data: Json, name = contract, plugin = owner) {
  return tree.appendToTimeline(sessionId, { contract: name, data, source: { plugin, resource: null }, model: null, recipient: null });
}

it("migrates only owned, declared timeline records, keeps session positions, and does not rerun at the same version", async () => {
  const root = setup();
  const before = openDatabase(root);
  const tree = new SessionTree(before), sessionId = tree.create("Notes");
  const old = add(tree, sessionId, { body: "owned" });
  const otherContract = add(tree, sessionId, { body: "different contract" }, `${owner}/other`);
  const otherAuthor = add(tree, sessionId, { body: "different author" }, contract, "test.other");
  tree.select(sessionId, old.id);
  const branch = add(tree, sessionId, { body: "another branch" });
  // Reconstruct the prior physical format with no record-version registry.
  before.exec("DROP TABLE plugin_record_versions; PRAGMA user_version = 35;");
  before.close();

  expect(await prepare(root)).toEqual({ ok: true, plugins: [] });
  const [point] = listRecoveryPoints(root);
  expect(point?.notice).toBe(true);
  expect(point?.changes).toEqual([{ id: "workspace", from: 35, to: 36 }, { id: `records:${owner}/history`, from: 1, to: 2 }]);
  const snapshotPath = join(recoveryPointDirectory(root, point!.id), "files");
  const snapshot = new DatabaseSync(join(snapshotPath, "db", "workspace.sqlite"), { readOnly: true });
  try { expect(new SessionTree(snapshot).node(sessionId, old.id)).toEqual(old); } finally { snapshot.close(); }
  const after = openDatabase(root);
  try {
    const next = new SessionTree(after);
    expect(next.nodes(sessionId)).toEqual([
      { ...old, data: { input: old.data } }, otherContract, otherAuthor, { ...branch, data: { input: branch.data } },
    ]);
    expect(next.cursor(sessionId)).toBe(branch.id);
  } finally { after.close(); }
  expect(await prepare(root)).toEqual({ ok: true, plugins: [] });
  expect(listRecoveryPoints(root).map(item => item.id)).toEqual([point!.id]);
  expect(await prepare(root, null)).toMatchObject({ ok: true, plugins: [{ id: owner, error: expect.stringContaining("does not declare record storage history") }] });
  expect(await prepare(root)).toEqual({ ok: true, plugins: [] });
  const v3 = { ...declaration, version: 3, migrations: { ...declaration.migrations, 2: (_contract: string, data: Json) => ({ updated: data }) } };
  expect(await prepare(root, v3)).toEqual({ ok: true, plugins: [] });
  expect(listRecoveryPoints(root)[0]?.changes).toEqual([{ id: `records:${owner}/history`, from: 2, to: 3 }]);
});

it("prepares text-only sent messages for the current contract without changing their history", async () => {
  const root = setup(), db = openDatabase(root);
  const author = "asterism.builtin";
  const tree = new SessionTree(db), sessionId = tree.create("Messages");
  const message = { id: "msg", sender: { id: "bot", name: "Bot", role: "self" as const }, sentAt: "2026-01-01T00:00:00Z", replyTo: "original" };
  const old = add(tree, sessionId, { ...message, text: "" }, ChatMessageSent.id, author);
  const current = add(tree, sessionId, { ...message, id: "next", parts: [{ kind: "text", text: "current" }] }, ChatMessageSent.id, author);
  db.close();

  expect(await prepare(root, messagingHistoryStorage, author)).toEqual({ ok: true, plugins: [] });
  const after = openDatabase(root);
  try {
    const reopened = new SessionTree(after);
    const [sent, latest] = reopened.nodes(sessionId);
    const converted = { ...message, parts: [{ kind: "text", text: "" }] };
    expect(sent).toEqual({ ...old, data: converted });
    expect(ChatMessageSent.schema.parse(sent!.data)).toEqual(converted);
    expect(latest).toEqual(current);
    expect(reopened.cursor(sessionId)).toBe(current.id);
  } finally { after.close(); }
});

it("prepares interleaved Agent responses without qualifying an orphaned thought from another response or session", async () => {
  const root = setup(), builtin = "asterism.builtin";
  const db = openDatabase(root), tree = new SessionTree(db);
  const first = tree.create("Interrupted"), second = tree.create("Complete");
  const source = { model: "p/m", adapter: "test", scope: "test" };
  const part = (kind: string, responseId: string, ordinal: number, complete: boolean, body: Record<string, Json>) =>
    ({ kind, responseId, ordinal, complete, requestParentId: null, source, continuation: null, ...body });
  function legacy(session: string, block: Json, published = false) {
    return published ? add(tree, session, { input: block, output: null }, `${builtin}/agent.tool-execution`, builtin)
      : add(tree, session, { type: "block", block }, `${builtin}/agent.execution`, builtin);
  }
  const orphan = legacy(first, part("thinking", "one", 0, true, { text: "orphan", summary: "" }));
  const thought = legacy(first, part("thinking", "two", 0, true, { text: "keep with tool", summary: "" }));
  const partial = legacy(first, part("text", "one", 1, false, { text: "partial" }));
  const tool = legacy(first, part("toolcall", "two", 1, false,
    { name: "read", callId: "read", arguments: { path: "note" }, argumentsText: null, outcome: null }), true);
  const other = legacy(second, part("text", "one", 1, true, { text: "different session" }));
  tree.select(first, orphan.id);
  db.close();

  expect(await prepare(root, agentToolHistoryStorage, builtin)).toEqual({ ok: true, plugins: [] });
  const [point] = listRecoveryPoints(root);
  expect(point?.changes).toEqual([{ id: `records:${builtin}/agent-tool-history`, from: 1, to: 3 }]);
  const prepared = openDatabase(root);
  try {
    const view = new SessionTree(prepared);
    expect(view.nodes(first)).toMatchObject([
      { id: orphan.id, data: { block: { complete: true, phantom: true } } },
      { id: thought.id, data: { block: { complete: true, phantom: false } } },
      { id: partial.id, data: { block: { complete: false, phantom: true } } },
      { id: tool.id, data: { input: { complete: false, phantom: false, input: { kind: "structured", value: { path: "note" } } }, output: null } },
    ]);
    expect(view.nodes(second)).toMatchObject([{ id: other.id, data: { block: { phantom: false } } }]);
    expect(view.cursor(first)).toBe(orphan.id);
  } finally { prepared.close(); }
});

it("rolls back earlier updates and leaves the version unstamped if a later record transform violates content ownership", async () => {
  const root = setup();
  const before = openDatabase(root);
  const tree = new SessionTree(before), sessionId = tree.create("Notes");
  const first = add(tree, sessionId, "first");
  const second = add(tree, sessionId, "second");
  before.close();
  const invalid = { ...declaration, migrations: { 1: (_contract: string, data: Json): Json => data === "first" ? "changed"
    : { "$asterism.content": "3684ddbf-8ef5-4f42-aec5-202eb28fb5db" } } };
  expect(await prepare(root, invalid)).toMatchObject({ ok: true, plugins: [{ id: owner, error: expect.stringContaining("preserve content references") }] });
  const after = openDatabase(root);
  try { expect(new SessionTree(after).nodes(sessionId)).toEqual([first, second]); } finally { after.close(); }
  expect(pluginStorages(root, owner, [declaration])[0]?.inspect()?.change).toMatchObject({ from: 1, to: 2 });
});

it("seeds a new record store before its first write so current records are not mistaken for unversioned history", async () => {
  const root = setup();
  // An interrupted first launch can leave the workspace file present but uninitialized.
  mkdirSync(join(root, "db"));
  new DatabaseSync(join(root, "db", "workspace.sqlite")).close();
  expect(await prepare(root)).toEqual({ ok: true, plugins: [] });
  const db = openDatabase(root);
  try {
    initializePluginRecordStorage(db, { declarations: new Map([[owner, [declaration]]]), failures: new Map() });
    const tree = new SessionTree(db), sessionId = tree.create("Fresh");
    add(tree, sessionId, { input: "already current" });
  } finally { db.close(); }
  expect(await prepare(root)).toEqual({ ok: true, plugins: [] });
  expect(listRecoveryPoints(root)).toEqual([]);
});

it("rejects declarations for another plugin's records and overlapping version scopes", () => {
  const root = setup();
  expect(() => pluginStorages(root, owner, [{ ...declaration, contracts: ["test.other/entry"] }])).toThrow("owned contract");
  expect(() => pluginStorages(root, owner, [declaration, { ...declaration, id: "other" }])).toThrow("unique owned contract");
});
