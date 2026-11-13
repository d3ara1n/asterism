import { describe, expect, it } from "vitest";
import { computeLineHash } from "../shared/hashline/hash.ts";
import { splitLines } from "../shared/hashline/lines.ts";
import { SEARCH_EXCERPT_THRESHOLD, textRow } from "../shared/text-row.ts";
import type { Todo } from "./model.ts";
import { buildTodoSearchDocument, mapTodoGrep, todoGrepToModel } from "./search.ts";

function todo(id: string, content: string, title = id): Todo {
  return {
    id, listId: "list", title, content, status: "done", assignee: null,
    completion: { note: "completion-only", completedBy: { kind: "user" }, completedAt: "today" },
    createdBy: { kind: "user" }, createdAt: "today", updatedBy: { kind: "user" }, updatedAt: "today",
  };
}
function row(line: number, content: string, match = true, focus = 0) {
  return { ...textRow(line, content, true, SEARCH_EXCERPT_THRESHOLD, focus), match };
}

// Synthetic rg rows keep these mapping tests independent of process execution and regex implementation.
describe("Todo content search mapping", () => {
  it("packs only Markdown lines without creating blank matches for empty tasks or dropping final empty lines", () => {
    const document = buildTodoSearchDocument([
      todo("empty", "", "title-only"), todo("a", "one\r\n\n"), todo("b", "two"), todo("blank", "\n"),
    ].values());
    expect(document.text).toBe("one\n\ntwo\n\n");
    expect(document.spans.map(span => ({ id: span.target.id, start: span.start, lines: span.lines }))).toEqual([
      { id: "a", start: 1, lines: ["one", ""] }, { id: "b", start: 3, lines: ["two"] }, { id: "blank", start: 4, lines: [""] },
    ]);
    expect(buildTodoSearchDocument([todo("empty", "")])).toEqual({ text: "", spans: [] });
  });

  it("rebases anchors to the task, counts a repeated match once, and retains the upstream global limit", () => {
    const document = buildTodoSearchDocument([todo("a", "first\nlast"), todo("b", "needle needle\ncontext", "Second")]);
    const result = { rows: [row(3, "needle needle"), row(4, "context", false)], stopReason: "limit" as const };
    const mapped = mapTodoGrep(document, result, true, 1);
    expect(mapped).toEqual({ matches: [{ target: { id: "b" }, title: "Second", rows: [
      { line: 1, content: "needle needle", hash: computeLineHash(1, "needle needle"), excerpt: null, match: true },
      { line: 2, content: "context", hash: computeLineHash(2, "context"), excerpt: null, match: false },
    ] }], stopReason: "limit" });
    expect(mapTodoGrep(document, result, false, 1).matches[0].rows.map(row => row.hash)).toEqual([null, null]);
    expect(todoGrepToModel(mapped)).toContain("1 matching line in 1 task · search incomplete");
    expect(todoGrepToModel(mapped)).toContain('"Second" · target {"id":"b"}');
  });

  it("drops neighboring context-only tasks and context belonging only to a different task's match", () => {
    const document = buildTodoSearchDocument([todo("a", "hit\na2\na3\na4"), todo("b", "hit\nb2"), todo("c", "c1")]);
    const rows = [row(1, "hit"), row(2, "a2", false), row(3, "a3", false), row(4, "a4", false),
      row(5, "hit"), row(6, "b2", false), row(7, "c1", false)];
    const mapped = mapTodoGrep(document, { rows, stopReason: null }, true, 2);
    expect(mapped.matches.map(group => ({ id: group.target.id, lines: group.rows.map(row => row.line) }))).toEqual([
      { id: "a", lines: [1, 2, 3] }, { id: "b", lines: [1, 2] },
    ]);
  });

  it.each([
    { content: "hit\r", original: "hit\r" },
    { content: "hit\r\n", original: "hit" },
    { content: "hit\r\r\n", original: "hit\r" },
  ])("uses original lines for anchors and content with $content", ({ content, original }) => {
    const document = buildTodoSearchDocument([todo("prefix", "before"), todo("target", content), todo("next", "after")]);
    // The combined document turns the original terminal CR into part of CRLF.
    const transported = splitLines(document.text)[1];
    const mapped = mapTodoGrep(document, { rows: [row(2, transported)], stopReason: null }, true);
    expect(mapped.matches[0].rows).toEqual([
      { line: 1, content: original, hash: computeLineHash(1, original), excerpt: null, match: true },
    ]);
  });

  it("restores UTF-16 surrogate text in excerpts and hashes the complete original line, not transport text", () => {
    const original = `${"x".repeat(1200)}\uD800needle${"y".repeat(600)}\r`;
    const document = buildTodoSearchDocument([todo("prefix", "before"), todo("target", original)]);
    const transport = Buffer.from(original.slice(0, -1), "utf8").toString("utf8");
    const global = row(2, transport, true, 1201);
    const mapped = mapTodoGrep(document, { rows: [global], stopReason: null }, true);
    const local = mapped.matches[0].rows[0];
    expect(local.line).toBe(1);
    expect(local.hash).toBe(computeLineHash(1, original));
    expect(local.content).toContain("\uD800needle");
    expect(local.excerpt).toEqual({ start: global.excerpt!.start, length: original.length });
    expect(local.content).toBe(original.slice(global.excerpt!.start, global.excerpt!.start + global.content.length));
  });

  it("bounds the complete grouped JSON including repeated multibyte titles and task targets", () => {
    const todos = Array.from({ length: 120 }, (_, i) => todo(`task-${i}`, "x".repeat(900), "🙂".repeat(80)));
    const document = buildTodoSearchDocument(todos);
    const mapped = mapTodoGrep(document, { rows: todos.map((task, i) => row(i + 1, task.content)), stopReason: "limit" }, true);
    expect(mapped.stopReason).toBe("output_bytes");
    expect(Buffer.byteLength(JSON.stringify(mapped))).toBeLessThanOrEqual(64 * 1024);
    expect(mapped.matches.length).toBeGreaterThan(0);
    expect(mapped.matches.length).toBeLessThan(todos.length);
    expect(mapped.matches.map(group => group.target.id)).toEqual(todos.slice(0, mapped.matches.length).map(todo => todo.id));
    const next = todos[mapped.matches.length];
    const nextGroup = { target: { id: next.id }, title: next.title, rows: [row(1, next.content)] };
    expect(Buffer.byteLength(JSON.stringify({ ...mapped, matches: [...mapped.matches, nextGroup] }))).toBeGreaterThan(64 * 1024);
  });

  it.each([false, true])("removes context for a match excluded by the grouped byte budget (earlier match: %s)", earlierMatch => {
    const content = ["first", ...Array.from({ length: 7 }, () => "gap"), "leading", "x".repeat(900)].join("\n");
    const rows = [...(earlierMatch ? [row(1, "first")] : []), row(9, "leading", false), row(10, "x".repeat(900))];
    // Leave room for leading context but not its following match; the target itself consumes the remaining space.
    const before = { matches: [{ target: { id: "" }, title: "Task", rows: rows.slice(0, -1) }], stopReason: "output_bytes" };
    const id = "i".repeat(64 * 1024 - Buffer.byteLength(JSON.stringify(before)) - 100);
    const document = buildTodoSearchDocument([todo(id, content, "Task")]);
    const mapped = mapTodoGrep(document, { rows, stopReason: null }, true, 1);
    expect(mapped.stopReason).toBe("output_bytes");
    expect(Buffer.byteLength(JSON.stringify(mapped))).toBeLessThanOrEqual(64 * 1024);
    expect(mapped.matches.flatMap(group => group.rows.map(row => row.line))).toEqual(earlierMatch ? [1] : []);
    expect(mapped.matches.length).toBe(earlierMatch ? 1 : 0);
  });
});
