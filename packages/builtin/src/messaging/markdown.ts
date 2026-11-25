/** Names and IDs are labels, never Markdown markup or extra lines in a transcript. */
export function markdownLabel(text: string): string {
  return text.replace(/\s+/gu, " ").replace(/[\\`*_{}[\]<>()#+\-.!|~&]/gu, "\\$&");
}

/** An opaque ID stays copyable, even when it contains Markdown punctuation. */
export function markdownCode(text: string): string {
  const longest = (text.match(/`+/gu) ?? []).reduce((length, run) => Math.max(length, run.length), 0);
  const fence = "`".repeat(longest + 1);
  return longest || text.startsWith(" ") || text.endsWith(" ") ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

/** Preserve paragraphs, nested Markdown and fenced blocks inside the quote. */
export function markdownQuote(text: string): string {
  return text.split(/\r\n?|\n/u).map(line => line ? `> ${line}` : ">").join("\n");
}
