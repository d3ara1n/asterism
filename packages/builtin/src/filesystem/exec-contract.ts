import { z } from "zod";
import { defineImplementation, defineTool } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";
import { Directory } from "./contract.ts";
import { execResultSchema, OUTPUT_CHAR_LIMIT, MAX_TIMEOUT_SECONDS } from "@asterism-app/sdk/contracts";

export const Exec = defineTool({
  id: builtin.name("tool.exec"), name: "exec",
  description: "Execute a shell command starting in the directory resource and return its output and exit status.",
  guidelines: [
    "Each invocation starts a fresh non-interactive shell process in the directory resource. Shell syntax, cd, pipelines and redirection are interpreted by that shell.",
    "shell_list_profile reports the host platform, shared shell profiles, resolved executable paths, and the default selection used by directory exec.",
    "Normally omit timeout and let the command finish or be cancelled. Specify it only when the task has an explicit time limit.",
    "Timeout and cancellation terminate the command's process group.",
    `If output exceeds ${OUTPUT_CHAR_LIMIT} Unicode characters, the result retains its tail and includes a truncation notice with the path to the temporary full output log, readable with subsequent shell commands.`,
  ],
  argsSchema: z.strictObject({
    command: z.string().min(1).describe("Command text interpreted by the configured shell."),
    timeout: z.number().positive().max(MAX_TIMEOUT_SECONDS).optional().describe("Total execution limit in seconds; omitted means no timeout."),
  }).describe("A non-interactive shell command and its optional execution timeout."),
});
export const DirectoryExec = defineImplementation({
  ...builtin.data("directory.exec", execResultSchema.describe("Processed shell output, optional temporary log location and execution status.")),
  resource: Directory, tool: Exec,
  targetSchema: z.null().describe("The directory resource supplies the initial working directory; target is omitted or null."),
  effect: "write", execution: "sequential",
});
