import type { Json } from "@asterism-app/sdk/contracts";

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
export interface ScriptReply {
  id: number;
  value: Json;
}
