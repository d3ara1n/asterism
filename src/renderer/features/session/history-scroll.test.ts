import { expect, it } from "vitest";
import { nearestHistoryAlignment } from "./history-scroll";

it("reveals a row below the viewport even when its list-local position would fit", () => {
  // 180px within a list preceded by a 40px header puts this row below a 200px viewport.
  expect(nearestHistoryAlignment(220, 20, 0, 200)).toBe("end");
});

it("reveals above rows and leaves fully visible edge-aligned rows in place", () => {
  expect(nearestHistoryAlignment(80, 20, 100, 200)).toBe("start");
  expect(nearestHistoryAlignment(100, 20, 100, 200)).toBeNull();
  expect(nearestHistoryAlignment(280, 20, 100, 200)).toBeNull();
});
