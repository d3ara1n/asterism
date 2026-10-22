import { defineMessages } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

export const terminalMessages = builtin.messages("en", defineMessages({
  terminal: { id: "terminal.title", defaultMessage: "Terminal" },
  noIntegration: { id: "terminal.noIntegration", defaultMessage: "This shell has no state detection. Input and screen reading remain available." },
  state: { id: "terminal.state", defaultMessage: "{state, select, inactive {Not started} starting {Starting} idle {Ready} running {Running} unknown {State unknown} exited {Exited} other {Failed}}" },
  start: { id: "terminal.start", defaultMessage: "Start terminal" },
  inactive: { id: "terminal.inactive", defaultMessage: "Start this terminal to open a new shell. Its previous process and output were not saved." },
  cwd: { id: "terminal.cwd", defaultMessage: "Working directory" },
  cwdHint: { id: "terminal.cwdHint", defaultMessage: "Home directory" },
  profile: { id: "terminal.profile", defaultMessage: "Shell profile" },
  defaultProfile: { id: "terminal.defaultProfile", defaultMessage: "Use default shell" },
  interrupt: { id: "terminal.interrupt", defaultMessage: "Send Ctrl+C" },
  read: { id: "terminal.read", defaultMessage: "Read terminal" },
  input: { id: "terminal.input", defaultMessage: "Terminal input" },
  wait: { id: "terminal.wait", defaultMessage: "Wait for shell" },
  see: { id: "terminal.see", defaultMessage: "View terminal" },
  runningWarning: { id: "terminal.runningWarning", defaultMessage: "This terminal has a running foreground command. Removing it will terminate its shell and child processes." },
  unknownWarning: { id: "terminal.unknownWarning", defaultMessage: "This terminal may have running programs. Removing it will terminate its shell and child processes." },
  failed: { id: "terminal.failed", defaultMessage: "Terminal operation failed: {error}" },
  exited: { id: "terminal.exited", defaultMessage: "Shell exited with code {code}. Create a new terminal to continue." },
}));
