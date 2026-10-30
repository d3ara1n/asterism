import type { ReplaceArgs, TextReplace } from "@asterism-app/builtin-api/contracts";
import { TextError, editToModel } from "./text.ts";

/** Native matching and substitution preserve JavaScript capture, context, and zero-width semantics. */
export function replaceText(text: string, args: ReplaceArgs): { text: string; matches: number } {
  const source = args.regex ? args.find : args.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flags = args.flags ?? "";
  let pattern: RegExp;
  try {
    pattern = new RegExp(source, flags.includes("g") ? flags : `${flags}g`);
  } catch (error) {
    throw new TextError("invalid_replace_pattern", error instanceof Error ? error.message : String(error));
  }
  let matches = 0;
  for (const _match of text.matchAll(pattern)) matches++;
  if (matches === 0) throw new TextError("replace_no_match", "The replacement pattern matched no content; the target is unchanged.");
  return { text: args.regex ? text.replace(pattern, args.replace) : text.replace(pattern, () => args.replace), matches };
}

export function replaceToModel(data: TextReplace): string {
  return `Matched ${data.matches} occurrence${data.matches === 1 ? "" : "s"}.\n${editToModel(data)}`;
}
