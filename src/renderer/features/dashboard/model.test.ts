import { describe, expect, it } from "vitest";
import { patchFilters, withoutFilter } from "./model";

describe("Dashboard filter transitions", () => {
  it("drops a provider and model from another category when the category changes", () => {
    const current = { modelKind: "language", providerId: "p", modelId: "m", folderId: "f" } as const;
    expect(patchFilters(current, { modelKind: "decision" })).toEqual({ modelKind: "decision", folderId: "f" });
    expect(patchFilters(current, { modelKind: "decision", providerId: "q" })).toEqual({ modelKind: "decision", providerId: "q", folderId: "f" });
  });

  it("keeps thinking out of a category that does not generate", () => {
    expect(patchFilters({ thinking: "high", folderId: "f" }, { modelKind: "decision" })).toEqual({ modelKind: "decision", folderId: "f" });
    // Choosing thinking replaces the contradicting category together with the values that belonged to it.
    expect(patchFilters({ modelKind: "decision", providerId: "q", folderId: "f" }, { thinking: null })).toEqual({ thinking: null, folderId: "f" });
    expect(patchFilters({ modelKind: "language", providerId: "p" }, { thinking: "high" })).toEqual({ modelKind: "language", providerId: "p", thinking: "high" });
  });

  it("keeps the category when a provider or model is removed, and removes them with the category", () => {
    const current = { modelKind: "language", providerId: "p", modelId: "m", thinking: "high" } as const;
    expect(withoutFilter(current, "providerId")).toEqual({ modelKind: "language", modelId: "m", thinking: "high" });
    expect(withoutFilter(withoutFilter(current, "providerId"), "modelId")).toEqual({ modelKind: "language", thinking: "high" });
    expect(withoutFilter(current, "modelKind")).toEqual({ thinking: "high" });
  });
});
