import { useI18n } from "@asterism-app/sdk/renderer";
import type { ToolCompletion, ToolResult } from "@asterism-app/sdk/contracts";
import { toolsMessages } from "./messages/tools";
import { StatusIcon } from "./ui/status";
import { toolOutcomeLabels, toolOutcomeTone } from "./tool-outcome";
import { cn } from "./utils";

type Unsuccessful = Exclude<ToolCompletion, { kind: "succeeded" }>;

/**
 * One place for how an operation ended badly: the outcome and its code lead, and the operation's own text follows unedited
 * so a reader can tell which lines are the error. The block stays outside content scrolling and bounds only its own text.
 */
export function ToolFailure({ result, className }: { result: Unsuccessful; className?: string }) {
  const i18n = useI18n();
  const diagnostic = "error" in result ? { code: result.error.code, text: result.error.message }
    : { code: null, text: result.message };
  return <div role="group" aria-label={i18n.text(toolOutcomeLabels[result.kind])}
    className={cn("flex min-w-0 flex-col gap-1.5 rounded-md bg-destructive/8 px-2.5 py-2", className)}>
    <p className="flex min-w-0 items-center gap-1.5 type-caption">
      <StatusIcon tone={toolOutcomeTone(result.kind)} className="size-3.5 shrink-0" />
      <span className="font-medium text-destructive">{i18n.text(toolOutcomeLabels[result.kind])}</span>
      {diagnostic.code && <span className="min-w-0 truncate font-mono text-muted-foreground">{diagnostic.code}</span>}
    </p>
    <div className="max-h-40 overflow-auto overscroll-contain pr-2">
      <p className="type-code m-0 whitespace-pre-wrap break-words select-text">{diagnostic.text}</p>
    </div>
  </div>;
}

/** Progress is not an ending; only a settled outcome that is neither success nor partial belongs to the failure block. */
export function unsuccessful(result: ToolResult | null): Unsuccessful | null {
  return result && result.kind !== "running" && result.kind !== "succeeded" && result.kind !== "partial"
    ? result as Unsuccessful : null;
}
