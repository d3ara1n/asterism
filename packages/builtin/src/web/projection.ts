import type { WebHint, WebResponse } from "@asterism-app/sdk/contracts";
import { WebError } from "@asterism-app/sdk/runtime";

/** Project known conditions without including free-form provider diagnostics. */
function resultHint({ code, parameter }: WebHint): string | undefined {
  const field = parameter ? `parameter ${JSON.stringify(parameter)}` : "parameter";
  switch (code) {
    case "unsupported_parameter": return `The requested ${field} was not applied.`;
    case "parameter_adjusted": return `The requested ${field} was adjusted.`;
    case "restrictions_relaxed": return "Some requested restrictions were relaxed.";
    case "content_unavailable": return "Content was unavailable for one or more sources.";
  }
}

export function webToModel(data: WebResponse): string {
  const hints = [...new Set(data.hints.map(resultHint).filter(hint => hint !== undefined))];
  return JSON.stringify({
    documents: data.documents.map(({ url, title, author, dates, content, links }) => ({ url, title, author, dates, content, links })),
    ...(hints.length ? { hints } : {}),
  });
}

/** The service supplies provider diagnostics to SDK callers; report the actionable failure at the tool boundary. */
export function webToolError(error: unknown, kind: "search" | "fetch"): { code: string; message: string } {
  if (error instanceof WebError) {
    const { code, sourceStatus } = error;
    if (sourceStatus !== undefined) return { code, message: `The requested page returned HTTP ${sourceStatus}.` };
    switch (code) {
      case "provider_unavailable": return { code, message: kind === "search" ? "Web search is unavailable. Check Web settings." : "Web retrieval is unavailable for this URL. Check Web settings." };
      case "credential_unavailable": return { code, message: "Web credentials are unavailable. Check Web settings." };
      case "unsupported": return { code, message: "This Web request is not supported." };
      case "invalid_request": return { code, message: "The Web request was rejected. Check the request parameters." };
      case "protocol": return { code, message: "The Web service did not return a usable response." };
      case "request_failed": break;
    }
  }
  return { code: "request_failed", message: kind === "search" ? "Web search failed." : "Could not retrieve the requested page." };
}
