import { z } from "zod";
import { defineImplementation, defineTool } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";
import { Directory } from "./contract.ts";
import { execResultSchema, OUTPUT_CHAR_LIMIT, MAX_TIMEOUT_SECONDS } from "../shell/contract.ts";

export const Exec = defineTool({
  id: builtin.name("tool.exec"), name: "exec",
  description: "Execute a command in a fresh non-interactive shell, starting in the directory resource.",
  guidelines: [
    "The directory supplies the initial working directory. Shell syntax, cd, pipelines and redirection are interpreted by the selected shell. Each invocation starts a fresh process.",
    "Directory inspect reports the selected shell executable and platform. Shell profiles are configured in Builtin settings.",
    `Output is processed for display. Text exceeding ${OUTPUT_CHAR_LIMIT} Unicode characters retains its tail; [Output truncated: ... Full output: <path>] identifies truncation and the temporary full output log.`,
    "The temporary log is an ordinary file available to subsequent shell commands while it exists. System cleanup may remove temporary logs; saved history retains the processed output tail.",
    "timeout is an optional total execution limit in seconds. Omitting it waits until the command exits or execution is cancelled. Timeout and cancellation terminate the command's process group.",
  ],
  argsSchema: z.strictObject({
    command: z.string().min(1).describe("Command text interpreted by the configured shell."),
    timeout: z.number().positive().max(MAX_TIMEOUT_SECONDS).optional().describe("Total execution limit in seconds; omitted means no timeout."),
  }).describe("A non-interactive shell command and its optional execution timeout."),
});
export const DirectoryExec = defineImplementation({
  ...builtin.data("directory.exec", execResultSchema),
  resource: Directory, tool: Exec,
  targetSchema: z.null().describe("The directory resource supplies the initial working directory; target is omitted or null."),
  effect: "write", execution: "sequential",
});
