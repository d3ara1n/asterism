import { Text } from "@codemirror/state";

export interface TextFormat {
  bom: boolean;
  lineSeparator: "\n" | "\r\n" | "\r";
}

/** Directory tools count LF and CRLF as newlines; in that mode a bare CR remains line content. */
export function parseEditorText(text: string, breaks: "all" | "lf" = "all"): { content: string; format: TextFormat } {
  const bom = text.startsWith("\uFEFF");
  const newlines = breaks === "lf" ? /\r?\n/gu : /\r\n?|\n/gu;
  const lineSeparator = newlines.exec(text)?.[0] as TextFormat["lineSeparator"] | undefined;
  return {
    content: (bom ? text.slice(1) : text).replace(newlines, "\n"),
    format: { bom, lineSeparator: lineSeparator ?? "\n" },
  };
}

/** Supply explicit LF-separated rows so CodeMirror does not split a directory line at a bare CR. */
export function editorDocument(content: string): Text {
  return Text.of(content.split("\n"));
}

export function serializeEditorText(content: string, format: TextFormat): string {
  return (format.bom ? "\uFEFF" : "") + content.replace(/\n/g, format.lineSeparator);
}
