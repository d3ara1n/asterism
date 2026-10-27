import type { DiagnosticRequest } from "./history";

/** Hit-rate numerator and denominator use the same conversation requests with complete reports, excluding compression material. */
export function cacheUsage(requests: readonly DiagnosticRequest[]) {
  const reported = requests.filter(request => request.kind === "response"
    && request.completion?.usage?.input != null && request.completion.usage.cacheRead != null);
  return reported.length ? {
    read: reported.reduce((sum, request) => sum + request.completion!.usage!.cacheRead!, 0),
    input: reported.reduce((sum, request) => sum + request.completion!.usage!.input!, 0),
    count: reported.length,
  } : null;
}
