import { useEffect, useMemo, useState } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import { runtime } from "../../runtime";

export type DisposalWarning = {
  objectId: string;
  title: string;
  warning: UiText;
};
export type DisposalWarnings = {
  status: "inactive" | "loading" | "ready" | "error";
  warnings: readonly DisposalWarning[];
};

/** Read current instance notices for a confirmation target. null is closed; "all" selects all session objects. */
export function useDisposalWarnings(
  sessionId: string,
  ids: readonly string[] | "all" | null,
): DisposalWarnings {
  const key = JSON.stringify(ids);
  // The query identity changes during render, so a new target never exposes a prior target's ready result before its effect runs.
  const query = useMemo(
    () => ({ sessionId, ids: JSON.parse(key) as typeof ids }),
    [sessionId, key],
  );
  const [value, setValue] = useState<{
    query: typeof query;
    result: DisposalWarnings;
  } | null>(null);
  useEffect(() => {
    if (query.ids === null || query.ids.length === 0) return;
    let active = true;
    void runtime.session
      .execute({
        type: "disposal.warnings",
        sessionId: query.sessionId,
        ...(query.ids === "all" ? {} : { objectIds: [...query.ids] }),
      })
      .then(
        (result) => {
          if (active)
            setValue({
              query,
              result:
                result.ok && result.reply.kind === "warnings"
                  ? { status: "ready", warnings: result.reply.warnings }
                  : { status: "error", warnings: [] },
            });
        },
        () => {
          if (active)
            setValue({ query, result: { status: "error", warnings: [] } });
        },
      );
    return () => {
      active = false;
    };
  }, [query]);
  if (ids === null) return { status: "inactive", warnings: [] };
  if (ids.length === 0) return { status: "ready", warnings: [] };
  return value?.query === query
    ? value.result
    : { status: "loading", warnings: [] };
}
