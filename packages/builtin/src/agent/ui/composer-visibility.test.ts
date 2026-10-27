import { expect, it } from "vitest";
import { createComposerVisibility } from "./composer-visibility";

// Workbench contract: hiding is the OR of all active requests; unmounting one UI cannot release an input area still held by another UI or affect another card.
it("Multiple UIs release their own hide requests independently without affecting other cards", () => {
  const first = createComposerVisibility(), second = createComposerVisibility();
  const question = first.hide(), another = first.hide(), otherCard = second.hide();
  question();
  question();
  expect(first.getSnapshot()).toBe(true);
  another();
  expect(first.getSnapshot()).toBe(false);
  expect(second.getSnapshot()).toBe(true);
  otherCard();
  expect(second.getSnapshot()).toBe(false);
});
