import type { Json } from "./json.ts";
import type { CallResult } from "./runtime-contracts.ts";
import type { ExecResult, ShellSettings, ShellProfileList } from "./shell.ts";
import type { TerminalSessions } from "./runtime-terminal.ts";

export interface ShellProfiles { get(): ShellSettings; list(): Promise<ShellProfileList> }
/** One noninteractive shell command with piped output and its own process lifetime. */
export interface ShellExecution {
  inspect(): Promise<Json>;
  execute(cwd: string, args: { command: string; timeout?: number }, options: {
    signal: AbortSignal; publish(data: ExecResult): void;
  }): Promise<CallResult<ExecResult>>;
}
/** Host shell capabilities share configured profiles; plugins own how they compose commands and terminal sessions. */
export interface ShellServices extends ShellExecution {
  readonly profiles: ShellProfiles;
  readonly terminals: TerminalSessions;
}
