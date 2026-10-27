import { useEffect, useState } from "react";
import type { UiText } from "@asterism/sdk/contracts";
import { runtime } from "../../runtime";

export type DisposalWarning = { objectId: string; title: string; warning: UiText };

/** Read disposal notices from the backend when the confirmation dialog opens; notices reflect current instance state and are not pushed with projections. ids is null when closed, and "all" selects all session objects. */
export function useDisposalWarnings(sessionId: string, ids: readonly string[] | "all" | null): readonly DisposalWarning[] {
  const [warnings, setWarnings] = useState<readonly DisposalWarning[]>([]);
  const key = ids === "all" ? "\0all" : ids ? ids.join("\n") : null;
  useEffect(() => {
    setWarnings([]);
    if (key === null || !key) return;
    let active = true;
    void runtime.session.execute({ type: "disposal.warnings", sessionId, ...(key === "\0all" ? {} : { objectIds: key.split("\n") }) }).then(result => {
      if (active && result.ok && result.reply.kind === "warnings") setWarnings(result.reply.warnings);
    });
    return () => { active = false; };
  }, [sessionId, key]);
  return warnings;
}
