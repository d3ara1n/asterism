import { describe, expect, it } from "vitest";
import { modelProviderInputSchema } from "./configuration.ts";

const provider = {
  id: "custom", name: "Custom", protocol: "openai-responses", baseUrl: "", enabled: true, auth: "api_key", compatibility: [],
};

describe("Model provider endpoint validation", () => {
  it("returns validation failures for blank and incomplete addresses while editing", () => {
    for (const baseUrl of ["", "https://"]) {
      const result = modelProviderInputSchema.safeParse({ ...provider, baseUrl });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues.some(issue => issue.path[0] === "baseUrl")).toBe(true);
    }
  });
});
