import { useEffect, useState } from "react";
import type { QueryResultOf, TelemetryFilter, TelemetryQuery } from "../../../shared/telemetry";
import { runtime } from "../../runtime";

export interface QueryState<T> {
  /** The latest successful result; kept while a newer read is pending so views do not flash. */
  data: T | null;
  /** The latest read failed. */
  error: boolean;
  /** A read is pending. */
  pending: boolean;
}

/** One ledger read, repeated when the filter, the query, or the revision changes. Out-of-order replies are discarded. */
export function useTelemetry<Q extends TelemetryQuery>(filter: TelemetryFilter, query: Q, revision: number, enabled = true): QueryState<QueryResultOf<Q>> {
  const key = JSON.stringify([filter, query]);
  const [state, setState] = useState<QueryState<QueryResultOf<Q>>>({ data: null, error: false, pending: enabled });
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setState(previous => ({ ...previous, pending: true }));
    const [requestFilter, request] = JSON.parse(key) as [TelemetryFilter, Q];
    runtime.telemetry.execute({ type: "query", filter: requestFilter, query: request }).then(result => {
      if (!current) return;
      if (result.ok && result.reply.kind === "query" && result.reply.result.kind === request.kind)
        setState({ data: result.reply.result as QueryResultOf<Q>, error: false, pending: false });
      else setState(previous => ({ ...previous, error: true, pending: false }));
    }, () => { if (current) setState(previous => ({ ...previous, error: true, pending: false })); });
    return () => { current = false; };
  }, [key, revision, enabled]);
  return state;
}
