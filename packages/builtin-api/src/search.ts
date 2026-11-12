import { z } from "zod";
import { defineTool } from "@asterism-app/sdk/contracts";
import { builtin } from "./identity.ts";

const pattern = z.string().min(1).refine(value => !value.includes("\0"), "Patterns must be free of NUL characters.");
const selection = {
  limit: z.number().int().positive().max(2000).optional().describe("Maximum returned matching lines, or entries in another resource-specific view; defaults to 500, maximum 2000. Context lines are bounded only by the output-byte budget."),
};
const globGuidelines = [
  "Globs use ripgrep semantics. A pattern without '/' such as '*.md' matches filenames at any depth.",
  "Positive globs override hidden and ignore rules for entries they match. A directory that remains excluded is skipped with its descendants.",
];

export const Find = defineTool({
  id: builtin.name("tool.find"), name: "glob",
  description: "Find files by glob pattern within a resource.",
  guidelines: [
    ...globGuidelines,
    "target selects the search scope and resource-specific file filtering according to the resource implementation's schema.",
  ],
  argsSchema: z.strictObject({
    pattern: pattern.describe("File glob relative to the selected search directory, using '/' separators; for example '**/*.ts' or '**/package.json'."),
    ...selection,
  }).describe("A file glob and search selection options."),
});

export const Grep = defineTool({
  id: builtin.name("tool.grep"), name: "grep",
  description: "Search text for a regular expression or literal pattern within a resource.",
  guidelines: [
    "Matching and context lines carry LINE#HASH anchors usable directly in edit where supported. Resource implementations define additional output views.",
    "Regular expressions use ripgrep's default Rust regex syntax. Matching is line-oriented.",
    "target selects the search scope and resource-specific content view according to the resource implementation's schema.",
  ],
  argsSchema: z.strictObject({
    pattern: pattern.describe("Pattern in ripgrep's default Rust regex syntax, without / delimiters. Matching is line-oriented; lookaround and pattern backreferences are unsupported. When literal is true, this is literal text."),
    literal: z.boolean().optional().describe("Interpret pattern as literal text; defaults to false."),
    ignoreCase: z.boolean().optional().describe("Use case-insensitive matching; defaults to false."),
    word: z.boolean().optional().describe("Match only at word boundaries; defaults to false."),
    context: z.number().int().min(0).max(20).optional().describe("Lines before and after each match in content mode; defaults to 0."),
    ...selection,
  }).describe("Text pattern, matching options, context and result limit."),
});

export type FindArgs = z.infer<typeof Find.argsSchema>;
export type GrepArgs = z.infer<typeof Grep.argsSchema>;
