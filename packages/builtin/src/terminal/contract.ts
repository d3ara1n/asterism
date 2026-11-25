import { terminalConfigSchema, terminalStateSchema, terminalStatusSchema, terminalImageSchema,
  type TerminalConfig, type TerminalImage, type TerminalStatus, type TerminalUp, type TerminalDown } from "@asterism-app/sdk/contracts";
import { z } from "zod";
import { defineCall, defineChannel, defineCreation, defineImplementation, defineTool, contentRefSchema } from "@asterism-app/sdk/contracts";
import { builtin, Read, See, Wait } from "@asterism-app/builtin-api/contracts";

export const TerminalResource = builtin.resource("terminal", terminalConfigSchema);
export const CreateTerminal = defineCreation(TerminalResource, {
  id: builtin.name("terminal.create"),
  schema: z.strictObject({
    title: z.string().trim().min(1).max(160).optional().describe("Display name; defaults to Terminal."),
    cwd: z.string().min(1).max(4096).optional().describe("Initial absolute working directory; defaults to the user's home directory. Commands run with the current OS user's permissions."),
    profile: z.string().min(1).optional().describe("Configured shell profile ID, listed by shell_list_profile, or 'auto' to check profiles in platform preference order, then remaining configured profiles. If omitted, the terminal inherits the shared shell selection at creation time."),
  }).describe("Create a shared interactive terminal. Its shell starts immediately and runs until the terminal is closed, removed or the application exits."),
});
/** Resource projection contains only configuration; terminal instance state is delivered through the terminal channel and stays out of session projection. */
export const TerminalView = builtin.data("terminal.card", terminalConfigSchema);

export const TerminalChannel = defineChannel<TerminalUp, TerminalDown>(builtin.name("terminal.channel"));
export const StartTerminal = defineCall(builtin.name("terminal.start"), { scope: "object", input: z.strictObject({}), output: z.null() });
export const CloseTerminal = defineCall(builtin.name("terminal.close"), { scope: "object", input: z.strictObject({}), output: z.null() });

export const keyNames = ["Enter", "Tab", "Escape", "Backspace", "Delete", "Up", "Down", "Left", "Right", "Home", "End", "PageUp", "PageDown", "Ctrl+C", "Ctrl+D", "Ctrl+Z", "Ctrl+L", "Ctrl+A", "Ctrl+E", "Ctrl+U", "Ctrl+K"] as const;
export const terminalInputSchema = z.strictObject({
  text: z.string().optional().describe("Text or literal control characters sent to the shared PTY. The foreground program receives this input."),
  key: z.enum(keyNames).optional().describe("A terminal key sent after text."),
  enter: z.boolean().optional().describe("Append Enter after text/key. Defaults to false."),
}).refine(value => value.text !== undefined || value.key !== undefined || value.enter === true,
  "Provide text, key, or enter:true.").describe("Input into the same terminal used by the user. Text can be sent without Enter.");
const Input = defineTool({ id: builtin.name("tool.terminal_input"), name: "terminal_input",
  description: "Send text or keys to a shared interactive terminal.",
  guidelines: ["Input goes to the current foreground program. Success means the input was delivered to the PTY.",
    "Input returns the terminal status observed after a brief 250 ms collection window. Short commands may already have returned to idle.",
    "Idle means the shell is at its command prompt; text entered without submission can also leave it idle. The read tool provides current terminal content; wait observes the shell until it returns to its prompt.",
    "A terminal that has not started starts a new shell on input. After its shell exits, the user restarts it from the terminal card.",
    "Shell variables and working directory persist within one shell instance."],
  argsSchema: terminalInputSchema });
export const TerminalInput = defineImplementation({ ...builtin.data("terminal.input-result", terminalStatusSchema.describe("Terminal status observed after input was delivered and shell feedback was collected for 250 ms.")),
  resource: TerminalResource, tool: Input, targetSchema: z.null().describe("Select the terminal itself."), effect: "write", execution: "sequential" });
/** Screen and buffer address the same parsed grid; raw addresses the original output stream. */
export const terminalReadTargetSchema = z.union([
  z.null().describe("Read the current screen as a parsed character grid. It takes no range input; the result's offset is the first screen row in the active buffer."),
  z.strictObject({
    source: z.enum(["buffer", "raw", "history"]).describe("buffer: parsed rows of the active buffer, including any retained scrollback (history is a compatibility alias). raw: original output with control sequences, escaped in the JSON result."),
    offset: z.number().int().nonnegative().optional().describe("Zero-based row for buffer, or stream offset (UTF-16 code units) for raw. Omitted selects the most recent content. An offset beyond the available range ends at the last boundary; raw offsets inside a surrogate pair align to its start."),
    limit: z.number().int().positive().max(65536).optional().describe("Maximum rows (buffer, default 100, capped at 2000) or UTF-16 code units (raw, default 16384). Raw reads may include one extra code unit to complete a surrogate pair."),
  }),
]).describe("Screen and buffer reads use the same zero-based row positions in the live active buffer. A buffer result reports the returned range as [offset, nextOffset), the buffer length as totalRows, and the current screen's first row as screenOffset, independent of viewer scrolling. nextOffset can be passed as offset to read the following range. User or program activity can rewrite rows; clearing, scrollback eviction, resizing, or switching buffers can move or remove them. The same range can return different text or no rows. Reads keep no per-caller position and observe the current shell instance, including the final screen of an exited shell.");
export const terminalReadResultSchema = terminalStatusSchema.extend({
  source: z.enum(["screen", "buffer", "raw", "history"]), text: z.string(), cols: z.number(), rows: z.number(),
  cursor: z.strictObject({ x: z.number(), y: z.number() }),
  offset: z.number().describe("Actual start of the returned range."),
  nextOffset: z.number().describe("Exclusive end of the returned range, reusable as offset for buffer or raw reads."),
  truncated: z.boolean().describe("For buffer, the range does not cover the entire active buffer at read time. For raw, the requested start was evicted or more output follows the returned range."),
  // Optional so saved read results without buffer coordinates remain decodable.
  buffer: z.enum(["normal", "alternate"]).optional().describe("For buffer reads, the active buffer at read time."),
  totalRows: z.number().int().nonnegative().optional().describe("For buffer reads, the number of rows in the active buffer at read time, including the screen."),
  screenOffset: z.number().int().nonnegative().optional().describe("For buffer reads, the first row of the current screen in the same coordinates as offset, at read time. Independent of viewer scrolling."),
}).describe("Observed terminal content, cursor, dimensions, state and retained range.");
export const TerminalRead = defineImplementation({ ...builtin.data("terminal.read-result", terminalReadResultSchema), resource: TerminalResource,
  tool: Read, targetSchema: terminalReadTargetSchema, effect: "read", execution: "parallel" });
export const TerminalWait = defineImplementation({ ...builtin.data("terminal.wait-result", terminalStatusSchema.extend({ elapsedMs: z.number() })
  .describe("Observed terminal state and elapsed wait time. lastExitCode reports the preceding command's exit status when shell integration provides it.")), resource: TerminalResource,
  tool: Wait, targetSchema: z.null().describe("Null waits until the shell returns to its command prompt (idle). Background jobs may still exist; shell integration supplies the state, and timeout or cancellation leaves the terminal running."),
  effect: "read", execution: "sequential" });
export const TerminalSee = defineImplementation({ ...builtin.data("terminal.image-result", z.strictObject({ image: contentRefSchema, cols: z.number(), rows: z.number(), state: terminalStateSchema }).describe("Captured terminal image and screen dimensions.")), resource: TerminalResource,
  tool: See, targetSchema: z.null().describe("Null captures the parsed terminal screen at this moment as a PNG, including colors, cursor and full-screen applications."), effect: "read", execution: "parallel" });

export const TerminalImageRequested = builtin.event("terminal.image-requested", { source: "plugin", semantics: { kind: "occurrence" },
  schema: z.strictObject({ id: z.string(), screen: terminalImageSchema }) });
export const CompleteTerminalImage = defineCall(builtin.name("terminal.image-complete"), { scope: "plugin",
  input: z.strictObject({ id: z.string(), png: z.string().nullable(), error: z.string().nullable() }), output: z.null() });
