import { describe, expect, it } from "vitest";
import { telegramMarkdown } from "./telegram-markdown.ts";

describe("Telegram Markdown conversion", () => {
  it("renders standard emphasis while keeping code outside overlapping entities", () => {
    expect(telegramMarkdown("**bold _italic_ and `x < 2`** ~~old~~")).toBe(
      "<b>bold </b><b><i>italic</i></b><b> and </b><code>x &lt; 2</code> <s>old</s>",
    );
    expect(telegramMarkdown("[**label** `code`](https://example.test)")).toBe(
      '<a href="https://example.test"><b>label</b></a><a href="https://example.test"> </a><code>code</code>',
    );
  });

  it("escapes literal HTML, punctuation and entities without treating code as markup", () => {
    expect(telegramMarkdown('A &amp; B &copy; &AMP; \\& \\< 2 <b>x</b>')).toBe(
      "A &amp; B &amp;copy; &amp;AMP; &amp; &lt; 2 &lt;b&gt;x&lt;/b&gt;",
    );
    expect(telegramMarkdown('`&amp; <b> **x**`')).toBe("<code>&amp;amp; &lt;b&gt; **x**</code>");
    expect(telegramMarkdown('<div>raw & text</div>')).toBe("&lt;div&gt;raw &amp; text&lt;/div&gt;");
  });

  it("retains code block indentation and newlines inside a list", () => {
    expect(telegramMarkdown('- code:\n\n  ```ts extra-info\n  if (x < 2) {\n    run("a&b");\n  }\n  ```')).toBe(
      '• code:\n\n<pre><code class="language-ts">if (x &lt; 2) {\n  run(&quot;a&amp;b&quot;);\n}</code></pre>',
    );
  });

  it("keeps nested list structure, ordered starts and task state without HTML list tags", () => {
    expect(telegramMarkdown("3. outer\n   - [x] done\n   - [ ] pending\n4. next")).toBe(
      "3. outer\n  • ☑ done\n  • ☐ pending\n4. next",
    );
  });

  it("resolves reference links, escapes URL attributes and avoids image links nested in links", () => {
    expect(telegramMarkdown('[site][ref]\n\n[ref]: https://example.test/?a=1&b=2')).toBe(
      '<a href="https://example.test/?a=1&amp;b=2">site</a>',
    );
    expect(telegramMarkdown('[![alt](https://image.test)](https://page.test)')).toBe(
      '<a href="https://page.test">alt</a>',
    );
    expect(telegramMarkdown('![alt](https://image.test)')).toBe('<a href="https://image.test">alt</a>');
  });

  it("flattens nested quotes and uses text markers where entity nesting is unsupported", () => {
    expect(telegramMarkdown("> first\n>\n> > **nested**")).toBe("<blockquote>first\n\n<b>nested</b></blockquote>");
    expect(telegramMarkdown("> use `code`")).toBe("▎ use <code>code</code>");
    expect(telegramMarkdown("> [link](https://example.test)")).toBe('▎ <a href="https://example.test">link</a>');
  });

  it("renders headings, tables and breaks without unsupported structural tags", () => {
    expect(telegramMarkdown("# Status\n\n| Item | Result |\n| --- | --- |\n| **A** | <ok> |\n\nfirst  \nsecond\n\n---")).toBe(
      "<b>Status</b>\n\nItem | Result\n<b>A</b> | &lt;ok&gt;\n\nfirst\nsecond\n\n———",
    );
  });
});
