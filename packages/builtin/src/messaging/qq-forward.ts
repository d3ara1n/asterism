import { markdownLabel, markdownQuote } from "./markdown.ts";

const messageHeader = /^=== 消息 ([1-9]\d*) ===[ \t]*$/u;
const relatedHeader = /^--- 第([1-9]\d*)条 ---[ \t]*$/u;
const contentLabel = "[消息内容]";
const senderLabel = "[发送者]";
const relatedLabel = "[关联消息]";
const quotedType = "[消息类型] 引用消息";

function bodyOf(lines: readonly string[], label: string): string | undefined {
  const first = lines[0];
  if (!first?.startsWith(label)) return;
  return [first.slice(label.length).replace(/^[ \t]/u, ""), ...lines.slice(1)].join("\n").replace(/\n+$/u, "");
}

/** QQ supplies this transcript as text. Only simplify a complete known envelope; otherwise retain it verbatim. */
export function qqForwardMarkdown(text: string): string {
  const lines = text.split(/\r\n?|\n/u);
  const title = /^\[(群聊的聊天记录|私聊的聊天记录)\][ \t]*$/u.exec(lines[0] ?? "")?.[1];
  if (!title) return text;
  const items: string[] = [];
  let i = 1;
  while (i < lines.length) {
    while (i < lines.length && !lines[i]!.trim()) i++;
    if (i === lines.length) break;
    const number = messageHeader.exec(lines[i++]!)?.[1];
    if (number !== String(items.length + 1)) return text;
    const start = i;
    while (i < lines.length && !lines[i]!.startsWith(senderLabel) && !messageHeader.test(lines[i]!)) i++;
    const body = start === i ? "" : bodyOf(lines.slice(start, i), contentLabel);
    const sender = lines[i++]?.match(/^\[发送者\][ \t]+(.+?)\s*$/u)?.[1];
    if (body === undefined || !sender) return text;

    const quotes: string[] = [];
    if (lines[i]?.trimEnd() === relatedLabel) {
      i++;
      while (i < lines.length && relatedHeader.test(lines[i]!)) {
        if (relatedHeader.exec(lines[i++]!)?.[1] !== String(quotes.length + 1)) return text;
        const first = i;
        // QQ indents the fields of each related entry, but continuation lines within its content may be unindented.
        while (i < lines.length && !/^ {4}\[消息类型\]/u.test(lines[i]!) &&
          !messageHeader.test(lines[i]!) && !relatedHeader.test(lines[i]!)) i++;
        const quote = bodyOf(lines.slice(first, i).map(line => line.replace(/^ {4}/u, "")), contentLabel);
        if (!quote?.trim() || lines[i++]?.trim() !== quotedType) return text;
        quotes.push(markdownQuote(quote));
      }
      if (!quotes.length) return text;
    }

    const continuation = " ".repeat(number.length + 2);
    const [firstLine, ...laterLines] = body.split("\n");
    const item = [`${number}. **${markdownLabel(sender)}**${firstLine ? `：${firstLine}` : ""}`, ...laterLines.map(line => continuation + line)];
    for (const quote of quotes) item.push("", ...quote.split("\n").map(line => continuation + line));
    items.push(item.join("\n"));
  }
  return items.length ? `**${title}**\n\n${items.join("\n")}` : text;
}
