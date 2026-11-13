import { Marked, Renderer, type Tokens } from "marked";

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Telegram accepts numeric entities and four named entities; other names remain readable literals. */
const textHtml = (value: string) => value.replace(/&(?!(?:amp|lt|gt|quot|#\d+|#[xX][\da-fA-F]+);)/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Render only Bot API HTML tags. Block structure without a Telegram equivalent uses text and newlines. */
class TelegramRenderer extends Renderer {
  private formats: { open: string; close: string }[] = [];
  private quoteDepth = 0;
  private listDepth = 0;

  private formatted(value: string): string {
    if (!value) return "";
    return this.formats.map(format => format.open).join("") + value + this.formats.toReversed().map(format => format.close).join("");
  }
  private inline(tokens: Tokens.Strong["tokens"], open: string, close: string): string {
    this.formats.push({ open, close });
    try { return this.parser.parseInline(tokens); }
    finally { this.formats.pop(); }
  }

  override strong({ tokens }: Tokens.Strong): string { return this.inline(tokens, "<b>", "</b>"); }
  override em({ tokens }: Tokens.Em): string { return this.inline(tokens, "<i>", "</i>"); }
  override del({ tokens }: Tokens.Del): string { return this.inline(tokens, "<s>", "</s>"); }
  override text(token: Tokens.Text | Tokens.Escape): string {
    return "tokens" in token && token.tokens ? this.parser.parseInline(token.tokens)
      : this.formatted(token.type === "escape" ? escape(token.text) : textHtml(token.text));
  }
  // Code entities cannot overlap other entities, including emphasis and links.
  override codespan({ text }: Tokens.Codespan): string { return `<code>${escape(text)}</code>`; }
  override code({ text, lang }: Tokens.Code): string {
    const language = lang?.match(/^\S+/)?.[0];
    return `<pre><code${language ? ` class="language-${escape(language)}"` : ""}>${escape(text)}</code></pre>\n\n`;
  }
  override link({ tokens, href, autolink }: Tokens.Link): string {
    const url = autolink ? escape(href) : textHtml(href);
    return this.inline(tokens, `<a href="${url}">`, "</a>");
  }
  override image({ tokens, href }: Tokens.Image): string {
    // Images are links in captions/body text; actual uploads use the provider's attachment path.
    if (this.formats.some(format => format.open.startsWith("<a "))) return this.parser.parseInline(tokens);
    return this.inline(tokens.length ? tokens : [{ type: "text", raw: href, text: href }], `<a href="${textHtml(href)}">`, "</a>");
  }
  override html({ text, block }: Tokens.HTML | Tokens.Tag): string {
    return this.formatted(escape(text)) + (block ? "\n\n" : "");
  }
  override br(): string { return "\n"; }
  override heading({ tokens }: Tokens.Heading): string { return this.inline(tokens, "<b>", "</b>") + "\n\n"; }
  override paragraph({ tokens }: Tokens.Paragraph): string { return this.parser.parseInline(tokens) + "\n\n"; }
  override hr(): string { return "———\n\n"; }
  override blockquote({ tokens }: Tokens.Blockquote): string {
    const nested = this.quoteDepth++ > 0;
    let body: string;
    try { body = this.parser.parse(tokens).trimEnd(); }
    finally { this.quoteDepth--; }
    // Telegram does not support nested blockquote entities.
    if (nested) return body + "\n\n";
    // Links and code cannot overlap a blockquote entity; keep the quote's textual marker in that case.
    return (/<(?:a |code>|pre>)/.test(body) ? `▎ ${body}` : `<blockquote>${body}</blockquote>`) + "\n\n";
  }
  override list({ items, ordered, start }: Tokens.List): string {
    const depth = this.listDepth++;
    try {
      const body = items.map((item, index) => {
        const marker = ordered ? `${Number(start) + index}. ` : "• ";
        return "  ".repeat(depth) + marker + this.parser.parse(item.tokens).trimEnd();
      }).join("\n");
      return (depth ? "\n" : "") + body + "\n\n";
    } finally { this.listDepth--; }
  }
  override checkbox({ checked }: Tokens.Checkbox): string { return checked ? "☑ " : "☐ "; }
  override table({ header, rows }: Tokens.Table): string {
    const row = (cells: Tokens.TableCell[]) => cells.map(cell => this.parser.parseInline(cell.tokens)).join(" | ");
    return [row(header), ...rows.map(row)].join("\n") + "\n\n";
  }
}

/** Each conversion owns renderer state; the SDK continues to carry the original Markdown text. */
export function telegramMarkdown(markdown: string): string {
  return new Marked().parse(markdown, { renderer: new TelegramRenderer(), gfm: true, async: false }).trimEnd();
}
