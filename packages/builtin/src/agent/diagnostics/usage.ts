import type { DiagnosticRequest } from "./history";

/** 命中率的分子、分母使用同批实报齐全的对话请求，不混入压缩材料。 */
export function cacheUsage(requests: readonly DiagnosticRequest[]) {
  const reported = requests.filter(request => request.kind === "response"
    && request.completion?.usage?.input != null && request.completion.usage.cacheRead != null);
  return reported.length ? {
    read: reported.reduce((sum, request) => sum + request.completion!.usage!.cacheRead!, 0),
    input: reported.reduce((sum, request) => sum + request.completion!.usage!.input!, 0),
    count: reported.length,
  } : null;
}
