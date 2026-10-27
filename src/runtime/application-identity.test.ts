import { describe, expect, it } from "vitest";
import { applicationDataDirectory } from "../shared/application.ts";

describe("Application identity and engineering manifest", () => {
  it("development and release use fixed identity directories independently of brand display names and repository directories", () => {
    expect(applicationDataDirectory(false)).toBe("dev.dearain.asterism.dev");
    expect(applicationDataDirectory(true)).toBe("dev.dearain.asterism");
  });
});
