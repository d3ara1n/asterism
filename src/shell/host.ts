import { implementCall, type CallContribution, type CommandExecution, type InteractiveTerminal, type TerminalProfiles, type TerminalSessions } from "@asterism-app/sdk/runtime";
import { ReadShellProfiles, type ShellSettings } from "@asterism-app/sdk/contracts";
import { SharedTerminal } from "../terminal/service.ts";
import { ShellService } from "./service.ts";
import { listShellProfiles } from "./profiles.ts";

/** Host shell capabilities: profile reads, piped commands and interactive terminals share the host lifetime. */
export class ShellHost {
  private readonly closing = new AbortController();
  private readonly live = new Set<InteractiveTerminal>();
  readonly profiles: TerminalProfiles;
  readonly commands: CommandExecution;
  readonly terminals: TerminalSessions;
  readonly calls: readonly CallContribution[];
  constructor(settings: () => ShellSettings, integrationRoot: string) {
    this.profiles = { get: settings, list: () => listShellProfiles(settings()) };
    this.commands = new ShellService(settings, this.closing.signal);
    this.terminals = { create: (config, events) => {
      const terminal: InteractiveTerminal = new SharedTerminal(config, settings, integrationRoot, events, () => this.live.delete(terminal));
      this.live.add(terminal);
      return terminal;
    } };
    this.calls = [implementCall(ReadShellProfiles, () => this.profiles.list())];
  }
  /** Ends commands and reaps terminals that their owners did not release. */
  async close(): Promise<void> {
    this.closing.abort();
    await Promise.all([...this.live].map(terminal => terminal.dispose()));
  }
}
