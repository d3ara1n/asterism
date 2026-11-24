import { builtin } from "@asterism-app/builtin-api/contracts";
import { shellProfileListSchema, type ExecResult } from "@asterism-app/sdk/contracts";

export const ShellProfileListResult = builtin.data("shell.profile-list", shellProfileListSchema
  .describe("Host platform, configured shell profiles, executable discovery results, and the configured and resolved shell selections."));

/** The model consumes output text and truncation notices; the UI shows execution information, and the shared tool layer generates explanations for unsuccessful outcomes. */
export function execToModel(data: ExecResult): string {
  const notice = data.truncation
    ? `\n\n[Output truncated: showing the last ${data.truncation.retainedChars} of ${data.truncation.totalChars} Unicode characters. Full output: ${data.truncation.file}]`
    : "";
  return data.output + notice;
}
