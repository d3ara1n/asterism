import type { WebHint, WebSearchRequest } from "@asterism-app/sdk/contracts";

export function searchResultLimit(provider: string, requested: number, maximum: number, hints: WebHint[]): number {
  if (requested > maximum) hints.push({ code: "parameter_adjusted", parameter: "maxResults",
    message: `${provider} accepts at most ${maximum} results; the requested maximum was reduced to ${maximum}.` });
  return Math.min(requested, maximum);
}

/** Calendar-date APIs cannot preserve a timestamp boundary; report the UTC day used. */
export function searchDate(provider: string, value: string | undefined, parameter: "publishedAfter" | "publishedBefore", hints: WebHint[]): string | undefined {
  if (!value?.includes("T")) return value;
  const day = new Date(value).toISOString().slice(0, 10);
  hints.push({ code: "parameter_adjusted", parameter,
    message: `${provider} applies dates at day precision; ${parameter} was reduced to ${day} (UTC).` });
  return day;
}

export function monthFirstDate(day: string | undefined): string | undefined {
  if (!day) return undefined;
  const [year, month, date] = day.split("-");
  return `${month}/${date}/${year}`;
}

/** These APIs accept either an inclusion list or an exclusion list. */
export function exclusiveDomains(provider: string, request: WebSearchRequest, hints: WebHint[]) {
  const includes = request.includeDomains?.length ? request.includeDomains : undefined;
  const excludes = request.excludeDomains?.length ? request.excludeDomains : undefined;
  if (includes && excludes) hints.push({ code: "unsupported_parameter", parameter: "excludeDomains",
    message: `${provider} accepts either included or excluded domains; excluded domains were not applied.` });
  return { includes, excludes: includes ? undefined : excludes };
}
