import { describe, expect, it } from "vitest";

import { fieldLabel, resourceStateFields, stateValue } from "./resource-state";

describe("resource state display", () => {
  it("drops top-level fields that repeat the header identity but keeps nested equal values", () => {
    const fields = resourceStateFields({
      type: "example/directory", title: "repo", path: "/work/repo", nested: { title: "repo" },
    }, { kind: "example/directory", title: "repo" });
    expect(fields.map(field => field.key)).toEqual(["path", "nested"]);
    expect(fields[1]!.value).toEqual({ kind: "group", fields: [{ key: "title", label: "Title", value: { kind: "text", value: "repo" } }] });
  });

  it("treats empty containers and empty text as absent values", () => {
    expect(resourceStateFields({}, undefined)).toEqual([]);
    expect([stateValue(null), stateValue(""), stateValue([]), stateValue({})]).toEqual(Array(4).fill({ kind: "empty" }));
  });

  it("separates identifier-like tokens, short text, and prose", () => {
    expect(stateValue("/Users/me/project").kind).toBe("token");
    expect(stateValue("asterism.builtin/web").kind).toBe("token");
    expect(stateValue("disconnected").kind).toBe("text");
    expect(stateValue("Microsoft Learn").kind).toBe("text");
    expect(stateValue("line one\nline two").kind).toBe("prose");
    expect(stateValue("x ".repeat(31)).kind).toBe("prose");
  });

  it("renders scalar arrays as a list and compound arrays as items", () => {
    expect(stateValue(["app", 2, true])).toEqual({ kind: "list", values: ["app", "2", "true"] });
    expect(stateValue([{ name: "Jira" }, "loose"])).toEqual({ kind: "items", items: [
      { kind: "group", fields: [{ key: "name", label: "Name", value: { kind: "text", value: "Jira" } }] },
      { kind: "text", value: "loose" },
    ] });
  });

  it("reads identifier keys as words", () => {
    expect(fieldLabel("tool_count")).toBe("Tool count");
    expect(fieldLabel("nextOffset")).toBe("Next offset");
    expect(fieldLabel("server-id")).toBe("Server id");
    expect(fieldLabel("__")).toBe("__");
  });

  it("keeps non-object state as a single unlabeled value", () => {
    expect(resourceStateFields("ready", undefined)).toEqual([{ key: "", label: "", value: { kind: "text", value: "ready" } }]);
  });
});
