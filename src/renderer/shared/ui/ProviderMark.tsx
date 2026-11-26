import anthropic from "@lobehub/icons-static-svg/icons/anthropic.svg?url";
import commandcode from "@lobehub/icons-static-svg/icons/commandcode.svg?url";
import deepseek from "@lobehub/icons-static-svg/icons/deepseek-color.svg?url";
import exa from "@lobehub/icons-static-svg/icons/exa.svg?url";
import firecrawl from "@lobehub/icons-static-svg/icons/firecrawl-color.svg?url";
import fireworks from "@lobehub/icons-static-svg/icons/fireworks.svg?url";
import huggingface from "@lobehub/icons-static-svg/icons/huggingface-color.svg?url";
import kilocode from "@lobehub/icons-static-svg/icons/kilocode.svg?url";
import kimi from "@lobehub/icons-static-svg/icons/kimi.svg?url";
import minimax from "@lobehub/icons-static-svg/icons/minimax-color.svg?url";
import mistral from "@lobehub/icons-static-svg/icons/mistral-color.svg?url";
import openai from "@lobehub/icons-static-svg/icons/openai.svg?url";
import opencode from "@lobehub/icons-static-svg/icons/opencode.svg?url";
import openrouter from "@lobehub/icons-static-svg/icons/openrouter.svg?url";
import perplexity from "@lobehub/icons-static-svg/icons/perplexity-color.svg?url";
import tavily from "@lobehub/icons-static-svg/icons/tavily-color.svg?url";
import together from "@lobehub/icons-static-svg/icons/together-color.svg?url";
import xai from "@lobehub/icons-static-svg/icons/xai.svg?url";
import zai from "@lobehub/icons-static-svg/icons/zai.svg?url";
import type { ReactNode } from "react";
import type { StatusTone } from "@asterism-app/ui/ui/status";
import { cn } from "@asterism-app/ui/utils";
import { markMonogram } from "./provider-mark";
import charmHyper from "./provider-icons/charm-hyper.png?url";

/** Select bundled brand marks explicitly; an icon ID cannot resolve to an arbitrary file or URL. */
const providerIcons = new Map(Object.entries({
  anthropic: { src: anthropic, mono: true },
  "charm-hyper": { src: charmHyper },
  commandcode: { src: commandcode, mono: true },
  deepseek: { src: deepseek },
  exa: { src: exa, mono: true },
  firecrawl: { src: firecrawl },
  fireworks: { src: fireworks, mono: true },
  huggingface: { src: huggingface },
  kilocode: { src: kilocode, mono: true },
  kimi: { src: kimi, mono: true },
  minimax: { src: minimax },
  mistral: { src: mistral },
  openai: { src: openai, mono: true },
  opencode: { src: opencode, mono: true },
  openrouter: { src: openrouter, mono: true },
  perplexity: { src: perplexity },
  tavily: { src: tavily },
  together: { src: together },
  xai: { src: xai, mono: true },
  zai: { src: zai, mono: true },
} satisfies Record<string, { src: string; mono?: boolean }>));

// Static class names keep every status token visible to the Tailwind scanner.
const statusDots: Record<StatusTone, string> = {
  success: "bg-success", warning: "bg-warning", error: "bg-destructive",
  progress: "bg-primary-text motion-safe:animate-pulse", neutral: "bg-muted-foreground",
};

/**
 * A service's identity plate in lists and pickers: its bundled brand mark, or its initial when it has none. A glyph marks an
 * entry that is not a service, such as a custom connection. Decorative beside the visible name; a status dot accompanies a
 * visible status label.
 */
export function ProviderMark({ name, iconId, glyph, status }: { name: string; iconId?: string; glyph?: ReactNode; status?: StatusTone }) {
  const icon = iconId ? providerIcons.get(iconId) : undefined;
  const kind = glyph ? "glyph" : icon ? "brand" : "monogram";
  return <span aria-hidden="true" data-slot="provider-mark" data-kind={kind} className="provider-mark">
    {glyph ?? (icon ? <img src={icon.src} alt="" draggable={false} className={cn(icon.mono && "dark:invert")} /> : markMonogram(name))}
    {status && <span className={cn("provider-mark-status", statusDots[status])} />}
  </span>;
}
