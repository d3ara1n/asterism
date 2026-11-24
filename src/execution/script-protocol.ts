import type { Json, ToolCompletion, ToolCallInput } from "@asterism-app/sdk/contracts";

export interface ScriptInput {
  code: string;
  tools: string[];
  interrupt: SharedArrayBuffer;
}
/** A bound handle sends its address separately from the tool payload. */
export interface ScriptResourceAddress { resourceId: string; tool: string }
export type ScriptRequest =
  | { type: "call"; id: number; name: string; input: ToolCallInput; address?: ScriptResourceAddress }
  | { type: "log"; value: Json }
  | { type: "done"; value: Json }
  | { type: "error"; message: string };
/** Private bridge payload; script code receives only result, with text retained by object identity. */
export interface ScriptReply {
  id: number;
  result: ToolCompletion;
  text: string;
}
