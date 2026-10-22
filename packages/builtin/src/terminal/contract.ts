import { z } from "zod";
import { defineCall, defineChannel, defineCreation, defineImplementation, defineTool, contentRefSchema } from "@atelier/sdk/contracts";
import { builtin, Read, See, Wait } from "@atelier/builtin-api/contracts";

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
  }).describe("Create a shared interactive terminal. Its shell starts immediately and runs until the terminal is closed, removed or the application exits."),
});
/** 资源投影只含配置；终端实例状态经终端通道交付，不进入会话投影。 */
export const TerminalView = builtin.data("terminal.card", terminalConfigSchema);

export const terminalStatusSchema = z.strictObject({
  state: terminalStateSchema, shell: z.string().nullable(), integration: z.boolean(),
  exitCode: z.number().nullable(), error: z.string().nullable(),
  /** shell 集成报告的当前目录；无集成时为 null。 */
  cwd: z.string().nullable(),
  /** 最近一条前台命令的退出码；无集成或尚未执行命令时为 null。 */
  lastExitCode: z.number().nullable(),
});
export type TerminalStatus = z.infer<typeof terminalStatusSchema>;
export const inactiveStatus: TerminalStatus = { state: "inactive", shell: null, integration: false, exitCode: null, error: null, cwd: null, lastExitCode: null };

/** 终端通道：前端发送输入、尺寸与已渲染字符数确认；后台发送屏幕重置、输出、尺寸与状态，均按序交付。 */
export type TerminalUp =
  | { type: "input"; data: string }
  /** xterm 二进制输入（如 X10 鼠标报告），每个字符为一个字节。 */
  | { type: "binary"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "ack"; chars: number }
  /** 前端屏幕重新挂载，请求当前屏幕快照。 */
  | { type: "refresh" };
export type TerminalDown =
  | { type: "reset"; cols: number; rows: number; data: string }
  | { type: "output"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "status"; status: TerminalStatus };
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
    "A terminal that has not started starts a new shell on input. After its shell exits, the user restarts it from the terminal card.",
    "Shell variables and working directory persist within one shell instance."],
  argsSchema: terminalInputSchema });
export const TerminalInput = defineImplementation({ ...builtin.data("terminal.input-result", terminalStatusSchema.describe("Terminal status after input was accepted.")),
  resource: TerminalResource, tool: Input, targetSchema: z.null().describe("Select the terminal itself."), effect: "write", execution: "sequential" });
/** 终端读取的内容选择：null 为当前屏幕；history 为保留的缓冲行；raw 为原始输出流。 */
export const terminalReadTargetSchema = z.union([
  z.null().describe("Select the visible screen: the parsed character grid with spaces and cursor coordinates."),
  z.strictObject({
    source: z.enum(["history", "raw"]).describe("history: retained terminal rows; raw: original output with control sequences, escaped in the JSON result."),
    offset: z.number().int().nonnegative().optional().describe("Zero-based row for history, or stream character offset (UTF-16 code units) for raw. Omitted selects the most recent content."),
    limit: z.number().int().positive().max(65536).optional().describe("Maximum rows (history, default 100, maximum 2000) or characters (raw, default 16384)."),
  }),
]).describe("Pass null for the current screen, or {\"source\":\"history\"} / {\"source\":\"raw\"} with an optional range. Reads observe the current shell instance, including the final screen of an exited shell; buffers are retained only during this application run. Terminal content has no edit anchors.");
export const terminalReadResultSchema = terminalStatusSchema.extend({
  source: z.enum(["screen", "history", "raw"]), text: z.string(), cols: z.number(), rows: z.number(),
  cursor: z.strictObject({ x: z.number(), y: z.number() }), offset: z.number(), nextOffset: z.number(), truncated: z.boolean(),
}).describe("Observed terminal content, cursor, dimensions, state and retained range.");
export const TerminalRead = defineImplementation({ ...builtin.data("terminal.read-result", terminalReadResultSchema), resource: TerminalResource,
  tool: Read, targetSchema: terminalReadTargetSchema, effect: "read", execution: "parallel" });
export const TerminalWait = defineImplementation({ ...builtin.data("terminal.wait-result", terminalStatusSchema.extend({ elapsedMs: z.number() })
  .describe("Observed terminal state and elapsed wait time. lastExitCode reports the preceding command's exit status when shell integration provides it.")), resource: TerminalResource,
  tool: Wait, targetSchema: z.null().describe("Null waits until the shell returns to its command prompt (idle). Background jobs may still exist; shell integration supplies the state, and timeout or cancellation leaves the terminal running."),
  effect: "read", execution: "sequential" });
export const TerminalSee = defineImplementation({ ...builtin.data("terminal.image-result", z.strictObject({ image: contentRefSchema, cols: z.number(), rows: z.number(), state: terminalStateSchema }).describe("Captured terminal image and screen dimensions.")), resource: TerminalResource,
  tool: See, targetSchema: z.null().describe("Null captures the parsed terminal screen at this moment as a PNG, including colors, cursor and full-screen applications."), effect: "read", execution: "parallel" });

const cellSchema = z.strictObject({ text: z.string(), width: z.number(), fg: z.string(), bg: z.string(), bold: z.boolean(), italic: z.boolean(), underline: z.boolean(), strike: z.boolean() });
export const terminalImageSchema = z.strictObject({ cols: z.number(), rows: z.number(), cursor: z.strictObject({ x: z.number(), y: z.number(), visible: z.boolean() }), cells: z.array(z.array(cellSchema)) });
export type TerminalImage = z.infer<typeof terminalImageSchema>;
export const TerminalImageRequested = builtin.event("terminal.image-requested", { source: "plugin", semantics: { kind: "occurrence" },
  schema: z.strictObject({ id: z.string(), screen: terminalImageSchema }) });
export const CompleteTerminalImage = defineCall(builtin.name("terminal.image-complete"), { scope: "plugin",
  input: z.strictObject({ id: z.string(), png: z.string().nullable(), error: z.string().nullable() }), output: z.null() });
