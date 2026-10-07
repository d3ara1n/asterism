import { memo } from "react";
import { Streamdown, type Components } from "streamdown";
import { externalWebUrl } from "../../../shared/links";
import { locale } from "../../shared/i18n";

const components: Components = {
  // 远程图片不自动发请求；保持现有 CSP，用户可以明确打开来源。
  img: ({ src, alt }) => {
    const url = typeof src === "string" ? externalWebUrl(src) : null;
    return url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{alt || (locale === "zh" ? "查看图片" : "View image")}</a>
      : <span>{alt}</span>;
  },
};
/** 解析、未闭合语法修复、代码块和表格交给 Streamdown，应用只配置显示与链接边界。 */
export const Markdown = memo(function Markdown({ children, streaming = false }: { children: string; streaming?: boolean }) {
  return <Streamdown className="type-body min-w-0 break-words [overflow-wrap:anywhere]" mode={streaming ? "streaming" : "static"} isAnimating={streaming}
    skipHtml components={components} linkSafety={{ enabled: false }} urlTransform={url => externalWebUrl(url) ?? ""}
    controls={{ code: { copy: true, download: false }, table: { copy: true, download: false, fullscreen: false }, image: false }}
    translations={locale === "zh" ? { copied: "已复制", copyCode: "复制代码", copyTable: "复制表格", copyTableAsCsv: "复制为 CSV", copyTableAsTsv: "复制为 TSV", copyTableAsMarkdown: "复制为 Markdown" } : undefined}>
    {children}
  </Streamdown>;
});
