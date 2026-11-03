import { describe, expect, it } from "vitest";
import { credentialChanged, credentialUpdate, secretUpdates } from "./provider-settings";

describe("Provider credential drafts", () => {
  // An empty password input never erases an existing credential or becomes an invalid replacement.
  it("keeps blank replacements and trims supplied credentials", () => {
    const blank = { action: "replace" as const, key: " \t " };
    expect(credentialUpdate(blank)).toEqual({ action: "keep" });
    expect(credentialChanged(blank)).toBe(false);
    expect(credentialUpdate({ action: "replace", key: " token " })).toEqual({ action: "replace", value: "token" });
  });
  // Clearing an optional credential must survive normalization even if an earlier typed value remains in the draft.
  it("submits explicit clears and replacements while omitting untouched or blank fields", () => {
    expect(secretUpdates({
      retained: { action: "keep", key: "" },
      empty: { action: "replace", key: " " },
      removed: { action: "clear", key: "previous input" },
      supplied: { action: "replace", key: " value " },
    })).toEqual({ removed: { action: "clear" }, supplied: { action: "replace", value: "value" } });
  });
});
