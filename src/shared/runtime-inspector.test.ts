import { expect, it } from "vitest";
import { runtimeInspectorPort } from "./runtime-inspector.ts";

it("recognizes only the explicit runtime flag and ignores it in packaged applications", () => {
  expect(runtimeInspectorPort(["electron", "--inspect=9229", "--inspect-runtime=9241"], false)).toBe(9241);
  expect(runtimeInspectorPort(["electron", "--inspect=9229"], false)).toBeUndefined();
  expect(runtimeInspectorPort(["electron", "--inspect-runtime=9241"], true)).toBeUndefined();
});

it("rejects ambiguous flags and values that are not explicit TCP ports", () => {
  for (const args of [
    ["--inspect-runtime"], ["--inspect-runtime=9230", "--inspect-runtime=9241"],
    ["--inspect-runtime=0"], ["--inspect-runtime=65536"], ["--inspect-runtime=9230oops"],
    ["--inspect-runtime=0.0.0.0:9230"],
  ]) expect(() => runtimeInspectorPort(args, false)).toThrow();
});
