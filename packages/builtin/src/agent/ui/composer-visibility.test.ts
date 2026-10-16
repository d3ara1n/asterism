import { expect, it } from "vitest";
import { createComposerVisibility } from "./composer-visibility";

// 工作台契约：隐藏取所有有效请求的或；卸载一个 UI 不能放开其他 UI 仍占用的输入区，也不能影响另一张卡片。
it("多个界面的隐藏请求各自释放，不跨卡片生效", () => {
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
