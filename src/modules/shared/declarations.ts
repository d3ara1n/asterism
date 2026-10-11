import { z } from "zod";
import { defineTool } from "@atelier/sdk/contracts";
import { editOperationSchema } from "./text-contract.ts";

/** 内置共享工具；模块也可声明独特工具或引用其他模块导出的定义。 */
export const List = defineTool({
  id: "atelier.core/tool.list",
  name: "list",
  description: "List the entries in a container to discover its contents and entry types.",
  guidelines: [
    "Choose a container using the resource implementation's target schema; use null only when the schema supports it.",
    "Pass args as an empty object. Listing discovers entries; it does not read their contents or search recursively.",
    "Check the result's truncation indicator before treating the listing as complete.",
  ],
  argsSchema: z.strictObject({}).describe("Listing takes no operation parameters; pass an empty object."),
});

export const Read = defineTool({
  id: "atelier.core/tool.read",
  name: "read",
  description: "Read the selected text content, with edit anchors by default.",
  guidelines: [
    "Choose the content and range using the implementation's target schema. Note read uses target:null for the complete note; directory read uses {\"path\":\"src/main.ts\",\"offset\":100,\"limit\":80}. Do not put location fields in args.",
    "Pass args:{} for anchors, or args:{\"anchored\":false} for a reading view without edit anchors.",
    "Current note and file implementations emit LINE#HASH│content. Copy these anchors verbatim into edit; absolute line numbers refer to the full text.",
    "Check nextOffset before treating a file read as complete. Continue with target.offset when supported. anchored:false results cannot supply edit anchors.",
  ],
  argsSchema: z.strictObject({
    anchored: z.boolean().optional().describe("Include edit anchors in the returned content; defaults to true. false returns line numbers and content without hashes."),
  }).describe("Reading behavior only. Content selection and range belong to target, not args."),
});

export const Edit = defineTool({
  id: "atelier.core/tool.edit",
  name: "edit",
  description: "Apply a batch of line-anchored text edits to an existing target, and return the actual diff and fresh anchors.",
  guidelines: [
    "Select an existing note with target:null, or a file with target:{\"path\":\"src/main.ts\"}. The edit operations belong in args.edits.",
    "Use {\"edits\":[{\"op\":\"replace\",\"anchor\":{\"line\":12,\"hash\":\"ABCD\"},\"body\":[\"new content\"]}]} with real anchors copied from read or a previous edit result; the example hash is a placeholder.",
    "replace/delete affect the inclusive anchor..end range; omit end only for one line. Only the cited endpoints are checked, not every interior line.",
    "insert_before/insert_after preserve the anchor line. Put only new lines in body; never copy the preserved anchor into body.",
    "append/prepend need body but no anchor. Each body item is one line without CR or LF; use an empty string for a blank line.",
    "Prefer one batch for multiple non-overlapping changes. Every operation uses the same pre-edit content; a failed anchor or overlapping range rejects the whole batch without writing.",
    "On anchor mismatch, review the supplied current line or shifted candidates and retry explicitly; targets are never moved automatically. After success use the fresh anchors, or read again for lines shifted by insertions/deletions.",
  ],
  argsSchema: z.strictObject({
    edits: z.array(editOperationSchema).min(1).max(500).describe("One to 500 non-overlapping hashline operations, all referring to the same current text."),
  }).describe("A complete batch of line-based edit operations. The target is selected separately."),
});

export const Write = defineTool({
  id: "atelier.core/tool.write",
  name: "write",
  description: "Write the complete text to a target, creating it where supported or overwriting its existing content.",
  guidelines: [
    "Pass the complete desired content in args.content, including exactly the intended line endings and final newline.",
    "Select an existing note with target:null, or a file with target:{\"path\":\"docs/new.md\"}. File write can create missing parent directories within the linked directory.",
    "write requires no anchors and returns none. Use edit for local changes to content you have read; use read after write if you need anchors.",
    "An existing target is overwritten. A write with identical content succeeds with changed:false.",
  ],
  argsSchema: z.strictObject({
    content: z.string().describe("The complete new UTF-8 text. Empty content clears the target; do not include displayed line numbers or hashes."),
  }).describe("Full replacement text without edit anchors. The implementation specifies its content size limit."),
});
