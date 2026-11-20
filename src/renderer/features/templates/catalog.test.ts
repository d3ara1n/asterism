import { describe, expect, it } from "vitest";
import type { TemplateSummary } from "../../../shared/templates";
import { viewTemplates, type TemplateView } from "./catalog";

const template = (id: string, title: string, createdAt: string, lastUsedAt: string | null = null, folderId: string | null = null): TemplateSummary =>
  ({ id, title, createdAt, lastUsedAt, folderId, objects: [] });
const ids = (templates: readonly TemplateSummary[], view: Partial<TemplateView>, locale = "en") =>
  viewTemplates(templates, { query: "", folder: "all", sort: "created", ...view }, locale).map(item => item.id);

describe("template catalog view", () => {
  it("puts recently used templates first and keeps never-used ones after them, newest first", () => {
    const templates = [template("old-unused", "A", "2026-01-01"), template("used-early", "B", "2026-01-02", "2026-03-01"),
      template("new-unused", "C", "2026-01-03"), template("used-late", "D", "2026-01-01", "2026-03-05")];
    expect(ids(templates, { sort: "recent" })).toEqual(["used-late", "used-early", "new-unused", "old-unused"]);
  });

  it("sorts names numerically and case-insensitively in both directions, breaking ties by newest", () => {
    const templates = [template("t10", "Task 10", "2026-01-01"), template("t2", "task 2", "2026-01-02"),
      template("dup-old", "Notes", "2026-01-01"), template("dup-new", "notes", "2026-01-05")];
    expect(ids(templates, { sort: "name-asc" })).toEqual(["dup-new", "dup-old", "t2", "t10"]);
    expect(ids(templates, { sort: "name-desc" })).toEqual(["t10", "t2", "dup-new", "dup-old"]);
  });

  it("filters by folder, including the no-folder choice, and matches trimmed queries against titles only", () => {
    const templates = [template("loose", "Review loop", "2026-01-01"), template("work", "Daily review", "2026-01-02", null, "f1"),
      template("other", "Planning", "2026-01-03", null, "f1")];
    expect(ids(templates, { folder: null })).toEqual(["loose"]);
    expect(ids(templates, { folder: "f1" })).toEqual(["other", "work"]);
    expect(ids(templates, { query: "  REVIEW " })).toEqual(["work", "loose"]);
    expect(ids(templates, { query: "f1" })).toEqual([]);
  });
});
