import type { CardAppearance } from "@asterism-app/sdk/contracts";
import { maximumCardDimension, type CardSize } from "./workbench.ts";
import { fallbackCardHeight, fallbackCardWidth, minimumCardHeight, minimumCardWidth } from "./workbench-layout.ts";

export const fallbackCardAppearance: CardAppearance = { width: fallbackCardWidth, height: fallbackCardHeight };

/** Frontend and backend share resolution rules for default dimensions, user overrides, and minimum dimensions. */
export function cardSize(appearance: CardAppearance = fallbackCardAppearance, override: CardSize | null = null): CardSize {
  const size = override ?? appearance;
  return {
    width: Math.min(maximumCardDimension, Math.max(appearance.minWidth ?? minimumCardWidth, size.width)),
    height: Math.min(maximumCardDimension, Math.max(appearance.minHeight ?? minimumCardHeight, size.height)),
  };
}
