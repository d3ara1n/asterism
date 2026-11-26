import { describe, expect, it } from "vitest";
import { parseCharmHyperCredits } from "./charm-hyper.ts";

describe("Charm Hyper credits", () => {
  it("reports the remaining Hypercredits without converting currency or inventing a quota", () => {
    expect(parseCharmHyperCredits({ balance: 12.5 })).toMatchObject([
      { type: "balance", scope: "account", remaining: 12.5, unit: { type: "count", label: "Hypercredits" } },
    ]);
  });

  it("does not show a balance when the team has disabled Hypercredit display", () => {
    expect(parseCharmHyperCredits({ balance_usd: 15 })).toEqual([]);
  });

  it("does not treat a malformed balance as zero or as a team opt-out", () => {
    expect(() => parseCharmHyperCredits({ balance: null })).toThrow(expect.objectContaining({ code: "protocol" }));
  });
});
