import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CachedMarkdown } from "@lobehub/streamdown";
import { describe, expect, it } from "vitest";
import { markdownOptions } from "./markdown-options";

function render(source: string) {
  return renderToStaticMarkup(createElement(CachedMarkdown, markdownOptions, source));
}

describe("Markdown 数学插件接入", () => {
  // workbench.md 富内容契约：行内、块级公式共用 KaTeX；捕获漏装解析或排版插件。
  it("将行内、块级公式排版为数学内容", () => {
    const html = render(String.raw`Inline $x^2$.

$$
\frac{1}{2}
$$`);
    expect(html.match(/<math\b/g)).toHaveLength(2);
    expect(html.match(/class="katex-display"/g)).toHaveLength(1);
  });

  // 代码契约要求源码不变；数学插件不能把代码内的公式标记当成正文公式转换。
  it("保留代码块的语言和公式原文", () => {
    const html = render('```python\n' + String.raw`print("$x$", "\(y\)")` + '\n```');
    expect(html).toContain('class="language-python"');
    expect(html).toContain(String.raw`$x$`);
    expect(html).toContain(String.raw`\(y\)`);
    expect(html).not.toContain('class="katex"');
  });

  // 未知公式命令不能使整条消息渲染抛错；错误应保留在公式局部。
  it("保留无法识别的公式命令并继续显示后续正文", () => {
    const html = render(String.raw`$\unknownAtelierCommand{x}$` + '\n\nStill readable.');
    expect(html).toContain(String.raw`\unknownAtelierCommand{x}`);
    expect(html).toContain('Still readable.');
  });
});
