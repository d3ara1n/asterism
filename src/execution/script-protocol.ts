import type { Json, ToolCompletion } from "@asterism-app/sdk/contracts";

export interface ScriptInput {
  code: string;
  tools: string[];
  interrupt: SharedArrayBuffer;
}
export type ScriptRequest =
  | { type: "call"; id: number; name: string; args: Json }
  | { type: "log"; value: Json }
  | { type: "done"; value: Json }
  | { type: "error"; message: string };
/** Private bridge payload; script code receives only result, with text retained by object identity. */
export interface ScriptReply {
  id: number;
  result: ToolCompletion;
  text: string;
}
