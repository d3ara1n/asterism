export interface TextFormat {
  bom: boolean;
  lineSeparator: "\n" | "\r\n" | "\r";
}

/** The editor works with logical lines; disk serialization retains the file's BOM and first newline style. */
export function parseEditorText(text: string): { content: string; format: TextFormat } {
  const bom = text.startsWith("\uFEFF");
  const lineSeparator = text.match(/\r\n|\r|\n/)?.[0] as TextFormat["lineSeparator"] | undefined;
  return {
    content: (bom ? text.slice(1) : text).replace(/\r\n|\r/g, "\n"),
    format: { bom, lineSeparator: lineSeparator ?? "\n" },
  };
}

export function serializeEditorText(content: string, format: TextFormat): string {
  return (format.bom ? "\uFEFF" : "") + content.replace(/\n/g, format.lineSeparator);
}
