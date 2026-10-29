import { builtin } from "@asterism-app/builtin-api/contracts";
import { shellProfileListSchema, type ExecResult } from "@asterism-app/sdk/contracts";

export const ShellProfileListResult = builtin.data("shell.profile-list", shellProfileListSchema
  .describe("Shared shell profiles for directory exec and terminal creation. Availability reflects executable discovery at query time."));

/** The model consumes output text and truncation notices; the UI shows execution information, and the shared tool layer generates explanations for unsuccessful outcomes. */
export function execToModel(data: ExecResult): string {
  const notice = data.truncation
    ? `\n\n[Output truncated: showing the last ${data.truncation.retainedChars} of ${data.truncation.totalChars} Unicode characters. Full output: ${data.truncation.file}]`
    : "";
  return data.output + notice;
}
