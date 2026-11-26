import { describe, expect, it } from "vitest";
import { parseMiniMaxPlan } from "./minimax.ts";

const plan = (...model_remains: Record<string, unknown>[]) => ({ base_resp: { status_code: 0 }, model_remains });

describe("MiniMax M Plan usage", () => {
  it("uses the text bucket's reported remaining percentages, ignoring count ambiguity and weekly display boosts", () => {
    expect(parseMiniMaxPlan(plan(
      { model_name: "image-01", current_weekly_remaining_percent: 80 },
      { model_name: "MiniMax-M*", start_time: 1_776_355_200_000, end_time: 1_776_373_200_000,
        current_interval_remaining_percent: 25, current_interval_total_count: 1500, current_interval_usage_count: 1125,
        current_weekly_remaining_percent: 58, weekly_boost_permille: 1500,
        weekly_start_time: 1_776_009_600_000, weekly_end_time: 1_776_614_400_000 },
    ))).toMatchObject([
      { id: "five-hour", value: { remaining: 0.25 }, window: { mode: "fixed", periodSeconds: 18_000, resetAt: 1_776_373_200_000 } },
      { id: "weekly", value: { remaining: 0.58 }, window: { mode: "fixed", periodSeconds: 604_800, resetAt: 1_776_614_400_000 } },
    ]);
  });

  it("uses the official count-only contract and does not manufacture a weekly limit for an unlimited window", () => {
    expect(parseMiniMaxPlan(plan({ model_name: "MiniMax-M*",
      current_interval_total_count: 1500, current_interval_usage_count: 228,
      current_weekly_status: 3, current_weekly_remaining_percent: 100,
    }))).toMatchObject([{ id: "five-hour", value: { remaining: 0.152 }, window: { resetAt: null } }]);
  });

  it("keeps exhausted windows distinct from missing quotas and body-level key failures", () => {
    expect(parseMiniMaxPlan(plan({ model_name: "text", current_interval_status: 2, current_interval_remaining_percent: 100 })))
      .toMatchObject([{ value: { remaining: 0 } }]);
    expect(parseMiniMaxPlan(plan({ model_name: "image-01", current_weekly_remaining_percent: 90 }))).toEqual([]);
    expect(() => parseMiniMaxPlan({ base_resp: { status_code: 1004 } }))
      .toThrow(expect.objectContaining({ code: "authentication" }));
  });
});
