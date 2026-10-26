import { z } from "zod";
import { defineTool } from "@asterism/sdk/contracts";
import { builtin } from "./identity.ts";
import { editOperationSchema } from "./text.ts";

/**
 * 公共资源工具：声明只规定参数与语义；target 选择什么、结果包含什么由各资源实现声明。
 * 第三方资源可实现同一声明，模型以同一工具名操作不同资源。
 */
export const List = defineTool({
  id: builtin.name("tool.list"),
  name: "list",
  description: "List the entries in a container to discover its contents and entry types.",
  guidelines: [
    "target selects a container according to the resource implementation's schema. args is an empty object.",
    "The result describes immediate entries and includes a truncation indicator.",
  ],
  argsSchema: z.strictObject({}).describe("Empty parameter object."),
});

export const Read = defineTool({
  id: builtin.name("tool.read"),
  name: "read",
  description: "Read the selected content as text.",
  guidelines: [
    "target selects the content and its range according to the resource implementation's schema.",
    "Editable text includes LINE#HASH edit anchors by default; args:{\"anchored\":false} omits them. Content that cannot be edited has no anchors.",
    "The result reports positions and a continuation point where the implementation supports ranges.",
  ],
  argsSchema: z.strictObject({
    anchored: z.boolean().optional().describe("Include edit anchors for editable text; defaults to true."),
  }).describe("Reading behavior. Content selection and range belong to target."),
});

export const Edit = defineTool({
  id: builtin.name("tool.edit"),
  name: "edit",
  description: "Apply a batch of line-anchored text edits to an existing target, and return the actual diff and fresh anchors.",
  guidelines: [
    "target selects existing editable text according to the resource implementation's schema. args.edits contains the operations.",
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
  id: builtin.name("tool.write"),
  name: "write",
  description: "Write the complete text to a target, creating it where supported or overwriting its existing content.",
  guidelines: [
    "args.content is the complete desired text, including line endings and final newline.",
    "target selects the destination according to the resource implementation's schema, which states whether missing targets are created.",
    "An existing target is overwritten. Success returns a brief confirmation and change statistics.",
  ],
  argsSchema: z.strictObject({
    content: z.string().describe("The complete new UTF-8 text. Empty content clears the target."),
  }).describe("Full replacement text. The implementation specifies its content size limit."),
});

export const See = defineTool({
  id: builtin.name("tool.see"),
  name: "see",
  description: "View an image so its pixels are attached to the tool result for you to inspect.",
  guidelines: [
    "target selects the image according to the resource implementation's schema. args is an empty object.",
  ],
  argsSchema: z.strictObject({}).describe("Empty parameter object."),
});

export const Wait = defineTool({
  id: builtin.name("tool.wait"),
  name: "wait",
  description: "Wait until a resource reaches its resting state, up to a timeout.",
  guidelines: [
    "The resource implementation defines its resting state. A resource already at rest returns immediately.",
    "Timeout or cancellation ends only the wait; the resource continues its own work. The result reports the observed state.",
  ],
  argsSchema: z.strictObject({
    timeout: z.number().positive().max(2147483).describe("Maximum wait in seconds."),
  }).describe("A bounded wait."),
});
