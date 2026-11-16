import { expect, it } from "vitest";
import { scrollbarPointerCoordinate } from "./scrollbar-coordinates";

it("normalizes pointer deltas without moving the screen-space origin", () => {
  expect(scrollbarPointerCoordinate(120, 100, 0.5)).toBe(140);
  expect(scrollbarPointerCoordinate(120, 100, 2)).toBe(110);
  expect(scrollbarPointerCoordinate(120, 100, 1)).toBe(120);
});

it("keeps a thumb grab point stable under canvas zoom", () => {
  // A 20px thumb grip 80 layout pixels down the track is 50 screen pixels from its origin at 50% zoom.
  const trackPointer = scrollbarPointerCoordinate(150, 100, 0.5) - 100;
  const thumbGrip = scrollbarPointerCoordinate(150, 140, 0.5) - 140;
  expect(trackPointer - thumbGrip).toBe(80);
});
