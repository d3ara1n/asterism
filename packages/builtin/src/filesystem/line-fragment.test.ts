import { describe, expect, it } from "vitest";
import { directoryFileLocation, parseLineFragment } from "./line-fragment.ts";

it("gives portable relative aliases one editor location without rewriting absolute or parent paths", () => {
  expect(directoryFileLocation("./src//./main.ts")).toBe("src/main.ts");
  expect(directoryFileLocation("./")).toBe(".");
  expect(directoryFileLocation("/src//main.ts")).toBe("/src//main.ts");
  expect(directoryFileLocation("../src//main.ts")).toBe("../src//main.ts");
});

describe("Directory line fragments", () => {
  it("distinguishes cursor and range requests, even for a one-line range", () => {
    expect(parseLineFragment("17")).toEqual({ startLine: 17 });
    expect(parseLineFragment("14-34")).toEqual({ startLine: 14, endLine: 34 });
    expect(parseLineFragment("14-14")).toEqual({ startLine: 14, endLine: 14 });
  });

  it("rejects malformed ranges and unusable line numbers", () => {
    expect(parseLineFragment("14notes")).toBeUndefined();
    expect(parseLineFragment("0-34")).toBeUndefined();
    expect(parseLineFragment("34-14")).toBeUndefined();
    expect(parseLineFragment("14-9007199254740992")).toBeUndefined();
  });
});
