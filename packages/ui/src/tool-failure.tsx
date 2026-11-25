import { useI18n } from "@asterism-app/sdk/renderer";
import type { ToolResult } from "@asterism-app/sdk/contracts";
import { toolOutcomeLabels } from "./tool-outcome";

/**
 * A settled outcome's explanation stays outside result content and does not decide whether that content is shown.
 * The block header names the outcome in its status color, so the explanation carries no second colored panel.
 */
export function ToolOutcomeNotice({ result }: { result: ToolResult | null }) {
  const i18n = useI18n();
  if (!result || result.kind === "running" || result.kind === "succeeded") return null;
  const diagnostic = "error" in result ? { code: result.error.code, text: result.error.message }
    : { code: null, text: result.message };
  return <div role="group" aria-label={i18n.text(toolOutcomeLabels[result.kind])} className="flex min-w-0 flex-col gap-1.5">
    {diagnostic.code && <p className="min-w-0 truncate type-caption font-mono">{diagnostic.code}</p>}
    <div className="max-h-40 overflow-auto overscroll-contain pr-2">
      <p className="type-code m-0 whitespace-pre-wrap break-words select-text">{diagnostic.text}</p>
    </div>
  </div>;
}
