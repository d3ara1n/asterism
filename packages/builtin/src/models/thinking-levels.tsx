import { thinkingLevels, type ThinkingLevel } from "@asterism-app/sdk/contracts";
import { useI18n } from "@asterism-app/sdk/renderer";
import { thinkingLabels } from "@asterism-app/ui/messages/model-selection";
import { cn } from "@asterism-app/ui/utils";
import { configurationMessages } from "../messages/configuration";

/** The full standard scale with supported levels filled; unsupported levels stay visible so gaps in the scale read at a glance. */
export function ThinkingLevelChips({ supported }: { supported: readonly ThinkingLevel[] }) {
  const i18n = useI18n();
  return <ul className="flex flex-wrap gap-1">{thinkingLevels.map(level => {
    const on = supported.includes(level);
    return <li key={level} className={cn("rounded-full border px-2 py-0.5 type-caption leading-none",
      on ? "border-transparent bg-secondary text-secondary-foreground" : "border-dashed text-muted-foreground/60 line-through")}>
      {i18n.text(thinkingLabels[level])}
      {!on && <span className="sr-only"> · {i18n.text(configurationMessages.unsupported)}</span>}
    </li>;
  })}</ul>;
}

/** Ascending steps over the model's reasoning levels, filled through the selected one; null draws dashed steps for the provider default. */
export function ThinkingMeter({ levels, value }: { levels: readonly ThinkingLevel[]; value: ThinkingLevel | null }) {
  const steps: readonly ThinkingLevel[] = levels.filter(level => level !== "off");
  if (!steps.length) return null;
  const index = value === null ? -1 : steps.indexOf(value);
  return <span aria-hidden="true" className="inline-flex h-3.5 items-end gap-0.5">{steps.map((level, step) =>
    <span key={level} style={{ height: `${30 + 70 * (step + 1) / steps.length}%` }} className={cn("w-1 rounded-[1px]",
      value === null ? "border border-dashed border-muted-foreground/50"
        : step <= index ? "bg-primary" : "bg-muted ring-1 ring-inset ring-border")} />)}
  </span>;
}
