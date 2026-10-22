import { z } from "zod";
import { defineCall, defineCreation, defineImplementation, defineTool, contentRefSchema } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

export const terminalStateSchema = z.enum(["inactive", "starting", "idle", "running", "unknown", "exited", "failed"]);
export type TerminalState = z.infer<typeof terminalStateSchema>;
export const terminalConfigSchema = z.strictObject({ cwd: z.string(), profile: z.string() });
export type TerminalConfig = z.infer<typeof terminalConfigSchema>;
export const TerminalResource = builtin.resource("terminal", terminalConfigSchema);
export const CreateTerminal = defineCreation(TerminalResource, {
  id: builtin.name("terminal.create"),
  schema: z.strictObject({
    title: z.string().trim().min(1).max(160).optional().describe("Display name; defaults to Terminal."),
    cwd: z.string().min(1).max(4096).optional().describe("Initial absolute working directory; defaults to the user's home directory. Commands run with the current OS user's permissions."),
    profile: z.string().min(1).optional().describe("Configured shell profile ID; defaults to the currently selected profile."),
  }).describe("Create a shared interactive terminal with one persistent shell for this application run."),
});
export const terminalStatusSchema = z.strictObject({
  state: terminalStateSchema, shell: z.string().nullable(), integration: z.boolean(),
  exitCode: z.number().nullable(), error: z.string().nullable(),
});
export type TerminalStatus = z.infer<typeof terminalStatusSchema>;
export const TerminalView = builtin.data("terminal.card", terminalStatusSchema.extend(terminalConfigSchema.shape));
export const terminalSnapshotSchema = terminalStatusSchema.extend({
  cols: z.number().int(), rows: z.number().int(), sequence: z.number().int(), serialized: z.string(),
});
export const ReadTerminal = defineCall(builtin.name("terminal.snapshot"), { scope: "object", input: z.strictObject({}), output: terminalSnapshotSchema });
export const StartTerminal = defineCall(builtin.name("terminal.start"), { scope: "object", input: z.strictObject({}), output: z.null() });
export const WriteTerminal = defineCall(builtin.name("terminal.input"), { scope: "object", input: z.strictObject({ data: z.string() }), output: z.null() });
export const ResizeTerminal = defineCall(builtin.name("terminal.resize"), { scope: "object",
  input: z.strictObject({ cols: z.number().int().min(2).max(500), rows: z.number().int().min(1).max(200) }), output: z.null() });

export const keyNames = ["Enter", "Tab", "Escape", "Backspace", "Delete", "Up", "Down", "Left", "Right", "Home", "End", "PageUp", "PageDown", "Ctrl+C", "Ctrl+D", "Ctrl+Z", "Ctrl+L", "Ctrl+A", "Ctrl+E", "Ctrl+U", "Ctrl+K"] as const;
export const terminalInputSchema = z.strictObject({
  text: z.string().optional().describe("Text or literal control characters sent to the shared PTY. The foreground program receives this input."),
  key: z.enum(keyNames).optional().describe("A terminal key sent after text."),
  enter: z.boolean().optional().describe("Append Enter after text/key. Defaults to false."),
}).refine(value => value.text !== undefined || value.key !== undefined || value.enter === true,
  "Provide text, key, or enter:true.").describe("Input into the same terminal used by the user. Text can be sent without Enter.");
const Input = defineTool({ id: builtin.name("tool.terminal_input"), name: "terminal_input",
  description: "Send text or keys to a shared interactive terminal.",
  guidelines: ["Input goes to the current foreground program. Success means the input was delivered to the PTY.", "An inactive terminal starts on input. Shell variables and working directory persist within that shell instance."],
  argsSchema: terminalInputSchema });
export const TerminalInput = defineImplementation({ ...builtin.data("terminal.input-result", terminalStatusSchema.describe("Terminal status after input was accepted.")),
  resource: TerminalResource, tool: Input, targetSchema: z.null().describe("Select the terminal itself."), effect: "write", execution: "sequential" });
const Read = defineTool({ id: builtin.name("tool.terminal_read"), name: "terminal_read", description: "Read the terminal screen, retained scrollback, or raw output stream.",
  guidelines: ["screen returns the parsed character grid with spaces and cursor coordinates. history returns retained terminal rows.", "raw returns original output with control characters escaped in JSON. Its offsets count UTF-16 code units.", "Reads observe current state. The buffer belongs to this shell instance and is retained only during this application run."],
  argsSchema: z.strictObject({
    mode: z.enum(["screen", "history", "raw"]).default("screen").describe("screen: visible grid; history: retained rows; raw: original control sequences."),
    offset: z.number().int().nonnegative().optional().describe("Zero-based row for history, or stream character offset for raw. Omitted selects the most recent content."),
    limit: z.number().int().positive().max(65536).optional().describe("Maximum rows (history, default 100) or characters (raw, default 16384)."),
  }).describe("Choose a terminal observation and optional range.") });
export const terminalReadResultSchema = terminalStatusSchema.extend({
  mode: z.enum(["screen", "history", "raw"]), text: z.string(), cols: z.number(), rows: z.number(),
  cursor: z.strictObject({ x: z.number(), y: z.number() }), offset: z.number(), nextOffset: z.number(), truncated: z.boolean(),
}).describe("Observed terminal content, cursor, dimensions, state and retained range.");
export const TerminalRead = defineImplementation({ ...builtin.data("terminal.read-result", terminalReadResultSchema), resource: TerminalResource,
  tool: Read, targetSchema: z.null().describe("Select the terminal itself."), effect: "read", execution: "parallel" });
const Wait = defineTool({ id: builtin.name("tool.wait_idle"), name: "wait_idle", description: "Wait for the interactive shell to return to its command prompt, up to a timeout.",
  guidelines: ["Idle means the shell is ready for another foreground command. The preceding command may have failed and background jobs may still exist.", "Timeout or cancellation ends the wait while the terminal continues running. Shell integration supplies the state."],
  argsSchema: z.strictObject({ timeout: z.number().positive().max(2147483).describe("Maximum wait in seconds.") }).describe("A bounded wait for the shell prompt.") });
export const TerminalWait = defineImplementation({ ...builtin.data("terminal.wait-result", terminalStatusSchema.extend({ elapsedMs: z.number() }).describe("Observed terminal state and elapsed wait time.")), resource: TerminalResource,
  tool: Wait, targetSchema: z.null().describe("Select the terminal itself."), effect: "read", execution: "sequential" });
const See = defineTool({ id: builtin.name("tool.terminal_see"), name: "terminal_see", description: "View the current terminal screen as a PNG image, including colors and cursor.",
  guidelines: ["The image represents the parsed terminal screen at capture time, including full-screen applications."], argsSchema: z.strictObject({}).describe("Empty parameter object.") });
export const TerminalSee = defineImplementation({ ...builtin.data("terminal.image-result", z.strictObject({ image: contentRefSchema, cols: z.number(), rows: z.number(), state: terminalStateSchema }).describe("Captured terminal image and screen dimensions.")), resource: TerminalResource,
  tool: See, targetSchema: z.null().describe("Select the terminal itself."), effect: "read", execution: "parallel" });

export type TerminalFrame = { sequence: number } & ({ kind: "output"; data: string } | { kind: "resize"; cols: number; rows: number });
const cellSchema = z.strictObject({ text: z.string(), width: z.number(), fg: z.string(), bg: z.string(), bold: z.boolean(), italic: z.boolean(), underline: z.boolean(), strike: z.boolean() });
export const terminalImageSchema = z.strictObject({ cols: z.number(), rows: z.number(), cursor: z.strictObject({ x: z.number(), y: z.number(), visible: z.boolean() }), cells: z.array(z.array(cellSchema)) });
export type TerminalImage = z.infer<typeof terminalImageSchema>;
export const TerminalImageRequested = builtin.event("terminal.image-requested", { source: "plugin", semantics: { kind: "occurrence" },
  schema: z.strictObject({ id: z.string(), screen: terminalImageSchema }) });
export const CompleteTerminalImage = defineCall(builtin.name("terminal.image-complete"), { scope: "plugin",
  input: z.strictObject({ id: z.string(), png: z.string().nullable(), error: z.string().nullable() }), output: z.null() });
