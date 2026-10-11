import { maximumCardDimension, type CardSize } from "../../../shared/workbench";
import type { CardAppearance } from "@atelier/sdk/renderer";
import { fallbackCardHeight, fallbackCardWidth, minimumCardHeight, minimumCardWidth } from "./layout";

export const fallbackCardAppearance: CardAppearance = { width: fallbackCardWidth, height: fallbackCardHeight };

/** 尺寸是画布单位；缩放画布不改写默认尺寸或用户覆盖。 */
export function cardSize(appearance: CardAppearance, override: CardSize | null = null): CardSize {
  const size = override ?? appearance;
  return {
    width: Math.min(maximumCardDimension, Math.max(appearance.minWidth ?? minimumCardWidth, size.width)),
    height: Math.min(maximumCardDimension, Math.max(appearance.minHeight ?? minimumCardHeight, size.height)),
  };
}
