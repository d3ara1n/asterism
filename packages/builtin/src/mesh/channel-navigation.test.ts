import { expect, it } from "vitest";
import { channelNavigationIndex } from "./channel-navigation.ts";

it("moves across unmounted channels and wraps at the collection bounds", () => {
  expect(channelNavigationIndex(100, 7, "ArrowDown")).toBe(8);
  expect(channelNavigationIndex(100, 99, "ArrowRight")).toBe(0);
  expect(channelNavigationIndex(100, 0, "ArrowUp")).toBe(99);
  expect(channelNavigationIndex(100, 8, "ArrowLeft")).toBe(7);
});

it("targets collection endpoints and leaves non-navigation keys alone", () => {
  expect(channelNavigationIndex(100, 8, "Home")).toBe(0);
  expect(channelNavigationIndex(100, 8, "End")).toBe(99);
  expect(channelNavigationIndex(100, 8, "PageUp")).toBe(0);
  expect(channelNavigationIndex(100, 8, "PageDown")).toBe(99);
  expect(channelNavigationIndex(100, 8, "Tab")).toBeNull();
  expect(channelNavigationIndex(0, -1, "ArrowDown")).toBeNull();
  expect(channelNavigationIndex(100, -1, "End")).toBeNull();
});
