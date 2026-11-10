import { z } from "zod";
import { defineTool, fileRefSchema } from "@asterism-app/sdk/contracts";
import { builtin } from "./identity.ts";
import { editOperationSchema } from "./text.ts";

/**
 * Public resource tools: declarations specify only parameters and semantics; each resource implementation declares what target selects and what results contain.
 * Third-party resources can implement the same declaration, letting models operate on different resources through the same tool name.
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

export const Metadata = defineTool({
  id: builtin.name("tool.metadata"),
  name: "metadata",
  description: "Read metadata for the selected target.",
  guidelines: [
    "target selects an entry according to the resource implementation's schema. args is an empty object.",
    "The resource implementation defines the metadata fields and their meaning.",
  ],
  argsSchema: z.strictObject({}).describe("Empty parameter object."),
});

export const Read = defineTool({
  id: builtin.name("tool.read"),
  name: "read",
  description: "Read the selected content as text.",
  guidelines: [
    "target selects the content, range, and reading view according to the resource implementation's schema.",
    "The result reports positions and a continuation point where the implementation supports ranges.",
  ],
  argsSchema: z.strictObject({}).describe("Empty parameter object. Content selection, range, and reading view belong to target."),
});

export const Edit = defineTool({
  id: builtin.name("tool.edit"),
  name: "edit",
  description: "Apply a batch of line-anchored text edits to an existing target, and return the actual diff and fresh anchors.",
  guidelines: [
    "target selects existing editable text according to the resource implementation's schema. args.edits contains the operations.",
    "Anchors contain a line number and its content hash, as returned by read, grep, edit, or replace.",
    "replace/delete affect the inclusive anchor..end range. An omitted end selects one line. Validation checks the cited endpoints.",
    "insert_before/insert_after preserve the anchor line. body contains the new lines.",
    "append/prepend take body. Each body item is one text line; an empty string represents a blank line.",
    "All operations refer to the same pre-edit content and commit as one batch. Anchor or overlap failures preserve the original text.",
    "Replace/delete ranges conflict when they share original lines. Insertions can share range boundaries; an insertion strictly inside a replaced or deleted range conflicts. Insertions at the same original gap appear in edits array order.",
    "Anchor mismatch results include current-line or shifted candidates. Successful results include the actual diff and fresh anchors.",
  ],
  argsSchema: z.strictObject({
    edits: z.array(editOperationSchema).min(1).max(500).describe("One to 500 hashline operations referring to the same current text. Replace/delete ranges have no shared lines; insertions may share boundaries and use array order at the same gap."),
  }).describe("A complete batch of line-based edit operations. The target is selected separately."),
});

export const Write = defineTool({
  id: builtin.name("tool.write"),
  name: "write",
  description: "Write complete text to a target.",
  guidelines: [
    "Use write only for new targets or complete rewrites.",
    "args.content is the complete desired text, including line endings and final newline.",
    "target selects the destination according to the resource implementation's schema, which states whether missing targets are created.",
    "An existing target is overwritten. Success returns a brief confirmation and change statistics.",
  ],
  argsSchema: z.strictObject({
    content: z.string().describe("The complete new UTF-8 text. Empty content clears the target."),
  }).describe("Full replacement text. The implementation specifies its content size limit."),
});
export const Save = defineTool({
  id: builtin.name("tool.save"), name: "save",
  description: "Save the bytes of a referenced file to a target.",
  guidelines: ["The resource implementation defines destination paths and replacement behavior."],
  argsSchema: z.strictObject({ ref: fileRefSchema }).describe("The source file reference. The target selects the destination."),
});

export const Replace = defineTool({
  id: builtin.name("tool.replace"),
  name: "replace",
  description: "Replace all occurrences of text or a regular expression in an existing target.",
  guidelines: [
    "target selects existing editable text. Matching covers the entire content, including line breaks, and does not verify edit anchors.",
    "Literal mode matches find as text and inserts replace verbatim. Regex mode uses JavaScript regular expressions and replacement syntax.",
    "All non-overlapping matches are replaced. flags applies in both modes; global matching is always enabled.",
    "No matches returns an error without changing the target. Matches that produce identical content succeed without writing.",
    "The result includes the match count, actual diff, and fresh anchors for changed lines. These anchors can be used by edit.",
  ],
  argsSchema: z.strictObject({
    find: z.string().min(1).describe("Non-empty text to find, or a JavaScript regular expression source when regex is true."),
    replace: z.string().describe("Replacement text; empty text deletes matches. Regex mode supports $$, $&, $1 through $99, $<name>, $` and $'. Literal mode preserves these sequences."),
    regex: z.boolean().optional().describe("Interpret find as a JavaScript (ECMAScript) regular expression source, without / delimiters. Supports lookaround, pattern backreferences, and named capture groups. Matching covers the entire target; flags controls matching options. Defaults to false (literal text)."),
    flags: z.string().regex(/^[gimsuv]*$/).optional().describe("Matching flags: i ignores case, m gives line anchors, s lets dot match line breaks, and u or v enables Unicode matching. g is implicit. Defaults to no additional flags."),
  }).describe("Search pattern, replacement text, and optional matching mode and flags."),
});
export type ReplaceArgs = z.infer<typeof Replace.argsSchema>;

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
  description: "Wait until a resource reaches its resting state, with an optional timeout.",
  guidelines: [
    "The resource implementation defines its resting state. A resource already at rest returns immediately.",
    "Normally omit timeout and wait for completion or cancellation. Specify it only when the task has an explicit time limit.",
    "Timeout or cancellation ends only the wait; the resource continues its own work. The result reports the observed state.",
  ],
  argsSchema: z.strictObject({
    timeout: z.number().positive().max(2147483).optional().describe("Optional maximum wait in seconds; omitted means no timeout."),
  }).describe("Wait with an optional time limit."),
});
