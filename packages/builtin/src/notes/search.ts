import type { z } from "zod";
import type { GrepArgs } from "@asterism-app/builtin-api/contracts";
import { grepOutput } from "../filesystem/search-output.ts";
import { runSearch, searchArguments } from "../filesystem/search-process.ts";
import { stopMessage } from "../filesystem/search-presentation.ts";
import { splitLines } from "../shared/hashline/lines.ts";
import { excerptNote, rowText } from "../shared/text-row.ts";
import type { NoteGrep } from "./contract.ts";

type NoteGrepResult = z.infer<typeof NoteGrep.schema>;

export async function grepNote(text: string, args: GrepArgs, anchored: boolean, signal: AbortSignal): Promise<NoteGrepResult> {
  const lines = splitLines(text);
  // Use the original UTF-16 lines for anchors and excerpts; UTF-8 transport can replace isolated surrogates.
  const output = grepOutput(".", "", args, anchored, line => lines[line - 1]);
  const argv = searchArguments("grep", args, "-");
  const stopReason = await runSearch(undefined, ["--text", ...argv], output.records, signal, text);
  return { rows: output.result.rows.map(({ path: _path, ...row }) => row), stopReason };
}

export function noteGrepToModel(data: NoteGrepResult): string {
  const matches = data.rows.filter(row => row.match);
  const lines = [`${matches.length} matching ${matches.length === 1 ? "line" : "lines"} · search ${data.stopReason === null ? "complete" : "incomplete"}`];
  if (matches.length && matches.length !== data.rows.length) lines.push(`Matching line numbers: ${matches.map(row => row.line).join(", ")}.`);
  let previous = 0;
  for (const row of data.rows) {
    if (previous && row.line !== previous + 1) lines.push("…");
    lines.push(rowText(row));
    previous = row.line;
  }
  lines.push(...data.rows.flatMap(row => excerptNote(row) ?? []));
  if (!data.rows.length) lines.push(data.stopReason === null ? "No matching lines." : "No results returned; the search is incomplete.");
  if (data.stopReason !== null) lines.push(stopMessage(data.stopReason, true));
  return lines.join("\n");
}
