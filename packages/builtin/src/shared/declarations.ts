import { z } from "zod";
import { defineTool } from "@atelier/sdk/contracts";
import { editOperationSchema } from "./text-contract.ts";

/** 内置共享工具；模块也可声明独特工具或引用其他模块导出的定义。 */
export const List = defineTool({
  id: "atelier.builtin/tool.list",
  name: "list",
  description: "List the entries in a container to discover its contents and entry types.",
  guidelines: [
    "target selects a container according to the resource implementation's schema. args is an empty object.",
    "The result describes immediate entries and includes a truncation indicator.",
  ],
  argsSchema: z.strictObject({}).describe("Empty parameter object."),
});

export const Read = defineTool({
  id: "atelier.builtin/tool.read",
  name: "read",
  description: "Read the selected text content, with edit anchors by default.",
  guidelines: [
    "target selects the content and range. Note read uses target:null for the complete note; directory read accepts {\"path\":\"src/main.ts\",\"offset\":100,\"limit\":80}.",
    "args:{} returns LINE#HASH│content with edit anchors; args:{\"anchored\":false} returns line numbers and content.",
    "Line numbers refer to the full text. A file result's nextOffset identifies the start of the remaining content.",
  ],
  argsSchema: z.strictObject({
    anchored: z.boolean().optional().describe("Include edit anchors in the returned content; defaults to true. false returns line numbers and content."),
  }).describe("Reading behavior. Content selection and range belong to target."),
});

export const Edit = defineTool({
  id: "atelier.builtin/tool.edit",
  name: "edit",
  description: "Apply a batch of line-anchored text edits to an existing target, and return the actual diff and fresh anchors.",
  guidelines: [
    "target:null selects an existing note; target:{\"path\":\"src/main.ts\"} selects a file. args.edits contains the operations.",
    "Anchors contain a line number and its content hash, as returned by read or edit.",
    "replace/delete affect the inclusive anchor..end range. An omitted end selects one line. Validation checks the cited endpoints.",
    "insert_before/insert_after preserve the anchor line. body contains the new lines.",
    "append/prepend take body. Each body item is one text line; an empty string represents a blank line.",
    "All operations refer to the same pre-edit content and commit as one batch. Anchor or overlap failures preserve the original text.",
    "Anchor mismatch results include current-line or shifted candidates. Successful results include the actual diff and fresh anchors.",
  ],
  argsSchema: z.strictObject({
    edits: z.array(editOperationSchema).min(1).max(500).describe("One to 500 non-overlapping hashline operations, all referring to the same current text."),
  }).describe("A complete batch of line-based edit operations. The target is selected separately."),
});

export const Write = defineTool({
  id: "atelier.builtin/tool.write",
  name: "write",
  description: "Write the complete text to a target, creating it where supported or overwriting its existing content.",
  guidelines: [
    "args.content is the complete desired text, including line endings and final newline.",
    "target:null selects an existing note; target:{\"path\":\"docs/new.md\"} selects a file. File write creates missing parent directories within the linked directory.",
    "An existing target is overwritten. Success returns a brief confirmation and change statistics.",
  ],
  argsSchema: z.strictObject({
    content: z.string().describe("The complete new UTF-8 text. Empty content clears the target."),
  }).describe("Full replacement text. The implementation specifies its content size limit."),
});

export const See = defineTool({
  id: "atelier.builtin/tool.see",
  name: "see",
  description: "View an image so its pixels are attached to the tool result for you to inspect.",
  guidelines: [
    "Supported image formats are PNG, JPEG, GIF, and WebP.",
    "target selects the image, e.g. {\"path\":\"docs/screenshot.png\"}. args is an empty object.",
  ],
  argsSchema: z.strictObject({}).describe("Empty parameter object."),
});
