/** A single-line header excerpt; stops scanning once the normalized prefix must be truncated. */
export function headerExcerptText(text: string): string {
  const limit = 160;
  let summary = "", length = 0, space = false;
  for (const character of text) {
    if (/\s/u.test(character)) {
      space = length > 0;
      continue;
    }
    if (length === limit || (space && length === limit - 1)) return summary + "…";
    if (space) {
      summary += " ";
      length++;
      space = false;
    }
    summary += character;
    length++;
  }
  return summary;
}
