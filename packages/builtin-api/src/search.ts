import { z } from "zod";
import { defineTool } from "@asterism-app/sdk/contracts";
import { builtin } from "./identity.ts";

const pattern = z.string().min(1).refine(value => !value.includes("\0"), "Patterns must be free of NUL characters.");
const selection = {
  hidden: z.boolean().optional().describe("Disable hidden-entry filtering; defaults to false. Ignore-file filtering is controlled separately by noIgnore."),
  noIgnore: z.boolean().optional().describe("Disable ignore-file filtering; defaults to false. Hidden-entry filtering is controlled separately by hidden."),
  limit: z.number().int().positive().max(2000).optional().describe("Maximum returned matching lines in grep content mode, or files otherwise; defaults to 500, maximum 2000. Context lines are bounded only by the output-byte budget. Matching lines with omitted content count toward the limit."),
};
const globGuidelines = [
  "Globs use ripgrep semantics. A pattern without '/' such as '*.md' matches filenames at any depth.",
  "Positive globs override hidden and ignore rules for entries they match. A directory that remains excluded is skipped with its descendants.",
];

export const Find = defineTool({
  id: builtin.name("tool.find"), name: "find",
  description: "Find files by glob pattern within a resource.",
  guidelines: globGuidelines,
  argsSchema: z.strictObject({
    pattern: pattern.describe("File glob relative to the selected search directory, using '/' separators; for example '**/*.ts' or '**/package.json'."),
    ...selection,
  }).describe("A file glob and search selection options."),
});

export const Grep = defineTool({
  id: builtin.name("tool.grep"), name: "grep",
  description: "Search file content for a regular expression or literal text within a resource.",
  guidelines: [
    "content mode groups matching and context lines under a per-file heading; when context lines are present, the heading lists the matching line numbers. files mode returns matching paths; count mode returns the number of matching lines per file.",
    "Regular expressions use ripgrep's default Rust regex syntax. Matching is line-oriented.",
    "Complete UTF-8 content rows include LINE#HASH edit anchors by default, shared with read and edit.",
    ...globGuidelines,
  ],
  argsSchema: z.strictObject({
    pattern: pattern.describe("Regular expression to search for, or literal text when literal is true."),
    literal: z.boolean().optional().describe("Interpret pattern as literal text; defaults to false."),
    ignoreCase: z.boolean().optional().describe("Use case-insensitive matching; defaults to false."),
    word: z.boolean().optional().describe("Match only at word boundaries; defaults to false."),
    glob: z.array(pattern).optional().describe("File globs relative to the search directory. Prefix exclusions with '!'; later globs take precedence."),
    context: z.number().int().min(0).max(20).optional().describe("Lines before and after each match in content mode; defaults to 0."),
    outputMode: z.enum(["content", "files", "count"]).optional().describe("Result format; defaults to content. Count means matching lines, rather than regex occurrences."),
    anchored: z.boolean().optional().describe("Include edit anchors in content mode; defaults to true."),
    ...selection,
  }).describe("Content pattern, file selection and output options."),
});

export type FindArgs = z.infer<typeof Find.argsSchema>;
export type GrepArgs = z.infer<typeof Grep.argsSchema>;
