import { primaryQuota, usageItemLevel, usageLevel, type UsageItem } from "@asterism-app/sdk/contracts";

/** The item behind a provider's level: the most constrained one, preferring the shortest window among equals, then source order. */
export function leadingItem(items: readonly UsageItem[]): UsageItem | null {
  const level = usageLevel(items);
  if (!level) return null;
  const tied = items.filter(item => usageItemLevel(item) === level);
  return primaryQuota(tied) ?? tied[0]!;
}
