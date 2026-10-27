import { describe, expect, it } from "vitest";
import type { Question } from "./contract.ts";
import { resultRows, submissionRows } from "./summary.ts";

const choice: Question = {
  id: "db", type: "single", question: "Which database?", required: true,
  options: [{ id: "pg", label: "Postgres" }, { id: "lite", label: "SQLite" }, { id: "mongo", label: "Mongo" }],
  recommendation: { optionId: "lite", reason: "Local first" },
};

// Result display treats saved answers as historical facts; original questions only supply unselected options, and discrepancies must not rewrite selected content.
describe("read-only question-and-answer summaries", () => {
  it("preserves saved option text in results and takes unselected options and recommendations from the same original question", () => {
    const [row] = resultRows([{ ...choice, options: [{ id: "pg", label: "Renamed" }, ...choice.options.slice(1)] }], {
      answers: [{ id: "db", question: "Which database?", type: "single", status: "answered", selected: [{ id: "pg", label: "Postgres" }] }],
    });
    expect(row!.selected).toEqual([{ id: "pg", label: "Postgres", recommended: false }]);
    expect(row!.others.map(option => [option.id, option.recommended])).toEqual([["lite", true], ["mongo", false]]);
  });

  it("does not infer unselected options when the original question is missing or its type differs", () => {
    const answer = { id: "db", question: "Which database?", type: "multiple" as const, status: "answered" as const,
      selected: [{ id: "pg", label: "Postgres" }], comment: "legacy" };
    expect(resultRows(null, { answers: [answer] })[0]).toMatchObject({ others: [], comment: "legacy" });
    expect(resultRows([choice], { answers: [answer] })[0]!.others).toEqual([]);
  });

  // Review and submission validation share rules: answers that fail validation appear as unanswered rather than as empty completed answers.
  it("shows questions that fail validation as unanswered during review and separates custom answers from options", () => {
    const rows = submissionRows([choice, { ...choice, id: "other" }], {
      answers: [{ id: "db", status: "answered", selected: [], text: "DuckDB" }, { id: "other", status: "answered", selected: [] }],
    });
    expect(rows[0]).toMatchObject({ status: "answered", selected: [], text: "DuckDB" });
    expect(rows[0]!.others).toHaveLength(3);
    expect(rows[1]).toMatchObject({ status: "pending", selected: [], others: [] });
  });
});
