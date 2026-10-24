import { describe, expect, it } from "vitest";
import type { Question } from "./contract.ts";
import { resultRows, submissionRows } from "./summary.ts";

const choice: Question = {
  id: "db", type: "single", question: "Which database?", required: true,
  options: [{ id: "pg", label: "Postgres" }, { id: "lite", label: "SQLite" }, { id: "mongo", label: "Mongo" }],
  recommendation: { optionId: "lite", reason: "Local first" },
};

// 结果展示以保存的答案为历史事实，原提问只用于补充未选项；两者不一致时不得改写已选内容。
describe("问答只读摘要", () => {
  it("结果保留保存的选项原文，未选项与推荐取自同一原提问", () => {
    const [row] = resultRows([{ ...choice, options: [{ id: "pg", label: "Renamed" }, ...choice.options.slice(1)] }], {
      answers: [{ id: "db", question: "Which database?", type: "single", status: "answered", selected: [{ id: "pg", label: "Postgres" }] }],
    });
    expect(row!.selected).toEqual([{ id: "pg", label: "Postgres", recommended: false }]);
    expect(row!.others.map(option => [option.id, option.recommended])).toEqual([["lite", true], ["mongo", false]]);
  });

  it("原提问缺失或题型不符时不推测未选项", () => {
    const answer = { id: "db", question: "Which database?", type: "multiple" as const, status: "answered" as const,
      selected: [{ id: "pg", label: "Postgres" }], comment: "legacy" };
    expect(resultRows(null, { answers: [answer] })[0]).toMatchObject({ others: [], comment: "legacy" });
    expect(resultRows([choice], { answers: [answer] })[0]!.others).toEqual([]);
  });

  // 复核与提交校验共用规则：未通过校验的回答显示待回答，而不是空的已回答。
  it("复核中未通过校验的题显示待回答，自定义答案与选项分开", () => {
    const rows = submissionRows([choice, { ...choice, id: "other" }], {
      answers: [{ id: "db", status: "answered", selected: [], text: "DuckDB" }, { id: "other", status: "answered", selected: [] }],
    });
    expect(rows[0]).toMatchObject({ status: "answered", selected: [], text: "DuckDB" });
    expect(rows[0]!.others).toHaveLength(3);
    expect(rows[1]).toMatchObject({ status: "pending", selected: [], others: [] });
  });
});
