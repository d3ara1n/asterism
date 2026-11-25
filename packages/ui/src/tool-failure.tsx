import { useI18n } from "@asterism-app/sdk/renderer";
import type { ToolResult } from "@asterism-app/sdk/contracts";
import { StatusIcon } from "./ui/status";
import { isToolError, toolOutcomeLabels, toolOutcomeTone } from "./tool-outcome";
import { cn } from "./utils";

/** A settled outcome's explanation stays outside result content and does not decide whether that content is shown. */
export function ToolOutcomeNotice({ result }: { result: ToolResult | null }) {
  const i18n = useI18n();
  if (!result || result.kind === "running" || result.kind === "succeeded") return null;
  const label = i18n.text(toolOutcomeLabels[result.kind]);
  const tone = toolOutcomeTone(result.kind);
  const toolError = isToolError(result.kind);
  const diagnostic = "error" in result ? { code: result.error.code, text: result.error.message }
    : { code: null, text: result.message };
  return <div role="group" aria-label={label}
    className={cn("flex min-w-0 flex-col gap-1.5",
      !toolError && ["rounded-md px-2.5 py-2", tone === "error" ? "bg-destructive/8" : tone === "warning" ? "bg-warning/8" : "bg-muted"])}>
    <p className="flex min-w-0 items-center gap-1.5 type-caption">
      {!toolError && <><StatusIcon tone={tone} className="size-3.5 shrink-0" /><span className="font-medium">{label}</span></>}
      {diagnostic.code && <span className="min-w-0 truncate font-mono text-muted-foreground">{diagnostic.code}</span>}
    </p>
    <div className="max-h-40 overflow-auto overscroll-contain pr-2">
      <p className="type-code m-0 whitespace-pre-wrap break-words select-text">{diagnostic.text}</p>
    </div>
  </div>;
}
