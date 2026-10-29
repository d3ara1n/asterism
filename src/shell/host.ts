import { implementCall, type CallContribution, type ShellServices, type InteractiveTerminal, type ShellProfiles, type TerminalSessions } from "@asterism-app/sdk/runtime";
import { ReadShellProfiles, type ShellSettings } from "@asterism-app/sdk/contracts";
import { SharedTerminal } from "./terminal/session.ts";
import { ShellExecutor } from "./execution.ts";
import { listShellProfiles } from "./profiles.ts";

/** Host shell capabilities: profile reads, piped commands and interactive terminals share the host lifetime. */
export class ShellHost implements ShellServices {
  private readonly closing = new AbortController();
  private readonly live = new Set<InteractiveTerminal>();
  readonly profiles: ShellProfiles;
  private readonly execution: ShellExecutor;
  readonly terminals: TerminalSessions;
  readonly calls: readonly CallContribution[];
  constructor(settings: () => ShellSettings, integrationRoot: string) {
    this.profiles = { get: settings, list: () => listShellProfiles(settings()) };
    this.execution = new ShellExecutor(settings, this.closing.signal);
    this.terminals = { create: (config, events) => {
      const terminal: InteractiveTerminal = new SharedTerminal(config, settings, integrationRoot, events, () => this.live.delete(terminal));
      this.live.add(terminal);
      return terminal;
    } };
    this.calls = [implementCall(ReadShellProfiles, () => this.profiles.list())];
  }
  inspect: ShellServices["inspect"] = () => this.execution.inspect();
  execute: ShellServices["execute"] = (cwd, args, options) => this.execution.execute(cwd, args, options);

  /** Ends commands and reaps terminals that their owners did not release. */
  async close(): Promise<void> {
    this.closing.abort();
    await Promise.all([...this.live].map(terminal => terminal.dispose()));
  }
}
