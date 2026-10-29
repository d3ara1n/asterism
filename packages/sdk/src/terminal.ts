import { z } from "zod";

export const terminalStateSchema = z.enum(["inactive", "starting", "idle", "running", "unknown", "exited", "failed"]);
export type TerminalState = z.infer<typeof terminalStateSchema>;
export const terminalConfigSchema = z.strictObject({ cwd: z.string(), profile: z.string() });
export type TerminalConfig = z.infer<typeof terminalConfigSchema>;

export const terminalStatusSchema = z.strictObject({
  state: terminalStateSchema, shell: z.string().nullable(), integration: z.boolean(),
  exitCode: z.number().nullable(), error: z.string().nullable(),
  /** Current directory reported by shell integration; null without integration. */
  cwd: z.string().nullable(),
  /** Exit code of the latest foreground command; null without integration or before any command has run. */
  lastExitCode: z.number().nullable(),
});
export type TerminalStatus = z.infer<typeof terminalStatusSchema>;
export const inactiveStatus: TerminalStatus = { state: "inactive", shell: null, integration: false, exitCode: null, error: null, cwd: null, lastExitCode: null };

/** Terminal channel: the frontend sends input, dimensions, and rendered-character acknowledgments; the backend sends screen resets, output, dimensions, and status, all delivered in order. */
export type TerminalUp =
  | { type: "input"; data: string }
  /** xterm binary input (such as X10 mouse reports), with each character representing one byte. */
  | { type: "binary"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "ack"; chars: number }
  /** The frontend screen has remounted and requests a current screen snapshot. */
  | { type: "refresh" };
export type TerminalDown =
  | { type: "reset"; cols: number; rows: number; data: string }
  | { type: "output"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "status"; status: TerminalStatus };

const cellSchema = z.strictObject({ text: z.string(), width: z.number(), fg: z.string(), bg: z.string(), bold: z.boolean(), italic: z.boolean(), underline: z.boolean(), strike: z.boolean() });
export const terminalImageSchema = z.strictObject({ cols: z.number(), rows: z.number(), cursor: z.strictObject({ x: z.number(), y: z.number(), visible: z.boolean() }), cells: z.array(z.array(cellSchema)) });
export type TerminalImage = z.infer<typeof terminalImageSchema>;
