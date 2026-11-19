import { describe, expect, it } from "vitest";
import type { ResourceActivity } from "@asterism-app/sdk/contracts";
import { sessionIndicator, type ResourceNoticeMark } from "./resource-status.ts";

const resource = (id: string) => ({ sessionId: "s", id, kind: "test" });
const work = (id: string, progress?: number): ResourceActivity =>
  ({ id, resource: resource(id), title: id, kind: "work", ...(progress === undefined ? {} : { progress: { value: progress } }) });
const instance = (id: string): ResourceActivity => ({ id, resource: resource(id), title: id, kind: "instance" });
const notice = (id: string, kind: ResourceNoticeMark["kind"]): ResourceNoticeMark => ({ resource: resource(id), title: id, kind });

describe("session indicator", () => {
  it("lets an unviewed notice cover running work while instances are counted apart from work", () => {
    expect(sessionIndicator([work("a"), instance("t"), instance("u")], [notice("a", "success"), notice("b", "attention")]))
      .toEqual({ state: { kind: "attention" }, instances: 2 });
  });

  it("returns to running once notices are consumed, with progress unknown unless every activity reports it", () => {
    expect(sessionIndicator([work("a", 0.5), work("b")], [])).toEqual({ state: { kind: "running", progress: null }, instances: 0 });
    expect(sessionIndicator([work("a", 0.5), work("b", 0.2)], []).state).toEqual({ kind: "running", progress: 0.2 });
  });

  it("has no state when only instances are open", () => {
    expect(sessionIndicator([instance("t")], [])).toEqual({ state: null, instances: 1 });
  });
});
