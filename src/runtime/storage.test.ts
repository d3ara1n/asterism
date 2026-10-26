import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SessionTree } from "../session/tree.ts";
import { created, event } from "../session/test-nodes.ts";
import { sessionRetentionMs } from "../shared/application.ts";
import { collectExpiredSessions, openDatabase } from "./storage.ts";

const roots: string[] = [], databases: DatabaseSync[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function setup() {
  const root = mkdtempSync(join(tmpdir(), "asterism-storage-")); roots.push(root);
  const db = openDatabase(root); databases.push(db);
  return { db, tree: new SessionTree(db) };
}
const count = (db: DatabaseSync, table: string, sessionId: string) =>
  Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`).get(sessionId) as { n: number }).n);

// 预期来自冷静期契约：只删除归档时间早于冷静期的会话，关联数据随会话整体消失。
describe("启动清理过期归档会话", () => {
  it("级联删除会话行、历史、游标选择日志与内容根，保留未过期和活跃会话", () => {
    const { db, tree } = setup();
    const now = Date.parse("2026-10-24T00:00:00Z");
    const expired = tree.create("expired"), recent = tree.create("recent"), active = tree.create("active");
    // 游标选择日志引用历史节点；两者都只因会话删除而级联，FK 失败会让整次删除报错。
    const first = tree.appendToTimeline(expired, created("a1", "Agent"));
    tree.appendToTimeline(expired, event("example.plugin/opaque", {}));
    tree.select(expired, first.id);
    db.prepare("INSERT INTO contents VALUES (?, ?, ?)").run("c1", "digest", 1);
    db.prepare("INSERT INTO content_roots VALUES (?, ?, ?, ?, ?)").run(expired, "a1", "data", "root", "c1");
    tree.archive(expired, new Date(now - sessionRetentionMs - 1).toISOString());
    tree.archive(recent, new Date(now - sessionRetentionMs + 60_000).toISOString());

    expect(collectExpiredSessions(db, now)).toBe(1);
    for (const table of ["session_nodes", "cursor_selections", "content_roots"]) expect(count(db, table, expired)).toBe(0);
    expect(db.prepare("SELECT id FROM sessions ORDER BY title").all().map(row => (row as { id: string }).id).sort())
      .toEqual([active, recent].sort());
    // 内容条目本身留给内容存储按无引用规则回收。
    expect(db.prepare("SELECT id FROM contents").all()).toEqual([{ id: "c1" }]);
  });
});

// 预期来自在场关口契约：归档会话对业务读取、写入与对象身份解析均不存在，回收站目录单独列出。
describe("归档会话在场关口", () => {
  it("归档后从活跃目录、游标读取与对象身份解析中消失，恢复后重新可见", () => {
    const { tree } = setup();
    const s = tree.create("S");
    tree.appendToTimeline(s, created("a1", "Agent"));
    expect(tree.resourceRef("a1")).toMatchObject({ sessionId: s });

    tree.archive(s, "2026-10-24T00:00:00.000Z");
    expect(tree.list()).toEqual([]);
    expect(tree.archived()).toMatchObject([{ id: s, archivedAt: "2026-10-24T00:00:00.000Z" }]);
    expect(() => tree.cursor(s)).toThrow("Session not found.");
    expect(() => tree.view(s)).toThrow("Session not found.");
    // 归档前已缓存的身份也不得再解析。
    expect(tree.resourceRef("a1")).toBeNull();

    tree.restore(s);
    expect(tree.list().map(item => item.id)).toEqual([s]);
    expect(tree.archived()).toEqual([]);
    expect(tree.resourceRef("a1")).toMatchObject({ sessionId: s });
  });
});
