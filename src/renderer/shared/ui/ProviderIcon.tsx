import anthropic from "@lobehub/icons-static-svg/icons/anthropic.svg?url";
import commandcode from "@lobehub/icons-static-svg/icons/commandcode.svg?url";
import deepseek from "@lobehub/icons-static-svg/icons/deepseek-color.svg?url";
import exa from "@lobehub/icons-static-svg/icons/exa.svg?url";
import firecrawl from "@lobehub/icons-static-svg/icons/firecrawl-color.svg?url";
import fireworks from "@lobehub/icons-static-svg/icons/fireworks.svg?url";
import huggingface from "@lobehub/icons-static-svg/icons/huggingface-color.svg?url";
import kimi from "@lobehub/icons-static-svg/icons/kimi.svg?url";
import openai from "@lobehub/icons-static-svg/icons/openai.svg?url";
import opencode from "@lobehub/icons-static-svg/icons/opencode.svg?url";
import openrouter from "@lobehub/icons-static-svg/icons/openrouter.svg?url";
import perplexity from "@lobehub/icons-static-svg/icons/perplexity-color.svg?url";
import tavily from "@lobehub/icons-static-svg/icons/tavily-color.svg?url";
import together from "@lobehub/icons-static-svg/icons/together-color.svg?url";
import xai from "@lobehub/icons-static-svg/icons/xai.svg?url";
import zai from "@lobehub/icons-static-svg/icons/zai.svg?url";
import { cn } from "@asterism-app/ui/utils";

/** Select bundled brand marks explicitly; an icon ID cannot resolve to an arbitrary file or URL. */
const providerIcons = new Map(Object.entries({
  anthropic: { src: anthropic, mono: true },
  commandcode: { src: commandcode, mono: true },
  deepseek: { src: deepseek },
  exa: { src: exa, mono: true },
  firecrawl: { src: firecrawl },
  fireworks: { src: fireworks, mono: true },
  huggingface: { src: huggingface },
  kimi: { src: kimi, mono: true },
  openai: { src: openai, mono: true },
  opencode: { src: opencode, mono: true },
  openrouter: { src: openrouter, mono: true },
  perplexity: { src: perplexity },
  tavily: { src: tavily },
  together: { src: together },
  xai: { src: xai, mono: true },
  zai: { src: zai, mono: true },
} satisfies Record<string, { src: string; mono?: boolean }>));

/** Decorative alongside the provider's visible name. */
export function ProviderIcon({ name, iconId }: { name: string; iconId?: string }) {
  const icon = iconId ? providerIcons.get(iconId) : undefined;
  return icon
    ? <img src={icon.src} alt="" draggable={false} className={cn("size-5 object-contain", icon.mono && "dark:invert")} />
    : <span aria-hidden="true" className="text-sm font-medium text-muted-foreground">{name.trim().charAt(0).toUpperCase() || "?"}</span>;
}
