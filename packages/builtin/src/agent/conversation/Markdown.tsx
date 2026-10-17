import { useI18n } from "@atelier/sdk/renderer";
import { memo } from "react";
import { Streamdown, type Components } from "streamdown";

import { externalWebUrl } from "@atelier/ui/links";
import { markdownMessages } from "../../messages/markdown";

const components: Components = {
  // 远程图片不自动发请求；保持现有 CSP，用户可以明确打开来源。
  img: ({ src, alt }) => {
    const i18n = useI18n();
    const url = typeof src === "string" ? externalWebUrl(src) : null;
    return url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary-text underline underline-offset-4">{alt || i18n.text(markdownMessages.markdownImage)}</a>
      : <span>{alt}</span>;
  },
};
/** 解析、未闭合语法修复、代码块和表格交给 Streamdown，应用只配置显示与链接边界。 */
export const Markdown = memo(function Markdown({ children, streaming = false }: { children: string; streaming?: boolean }) {
  const i18n = useI18n();
  return <Streamdown className="type-body min-w-0 break-words [overflow-wrap:anywhere]" mode={streaming ? "streaming" : "static"} isAnimating={streaming}
    skipHtml components={components} linkSafety={{ enabled: false }} urlTransform={url => externalWebUrl(url) ?? ""}
    controls={{ code: { copy: true, download: false }, table: { copy: true, download: false, fullscreen: false }, image: false }}
    translations={{ copied: i18n.text(markdownMessages.markdownCopied), copyCode: i18n.text(markdownMessages.markdownCopyCode), copyTable: i18n.text(markdownMessages.markdownCopyTable), copyTableAsCsv: i18n.text(markdownMessages.markdownCopyCsv), copyTableAsTsv: i18n.text(markdownMessages.markdownCopyTsv), copyTableAsMarkdown: i18n.text(markdownMessages.markdownCopyMarkdown) }}>
    {children}
  </Streamdown>;
});
