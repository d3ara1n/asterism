import type { CardAppearance } from "@atelier/sdk/contracts";
import { maximumCardDimension, type CardSize } from "./workbench.ts";
import { fallbackCardHeight, fallbackCardWidth, minimumCardHeight, minimumCardWidth } from "./workbench-layout.ts";

export const fallbackCardAppearance: CardAppearance = { width: fallbackCardWidth, height: fallbackCardHeight };

/** 默认尺寸、用户覆盖和尺寸下限在前后台使用同一解析规则。 */
export function cardSize(appearance: CardAppearance = fallbackCardAppearance, override: CardSize | null = null): CardSize {
  const size = override ?? appearance;
  return {
    width: Math.min(maximumCardDimension, Math.max(appearance.minWidth ?? minimumCardWidth, size.width)),
    height: Math.min(maximumCardDimension, Math.max(appearance.minHeight ?? minimumCardHeight, size.height)),
  };
}
