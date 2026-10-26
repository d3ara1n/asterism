import type { StreamdownProps } from "@lobehub/streamdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { externalWebUrl } from "@asterism/ui/links";

/** 历史与实时内容共用标准 Markdown 插件，不在解析前改写正文或代码。 */
export const markdownOptions = {
  skipHtml: true,
  remarkPlugins: [remarkGfm, remarkMath],
  rehypePlugins: [[rehypeKatex, { trust: false }]],
  urlTransform: (url: string) => externalWebUrl(url) ?? "",
} satisfies Omit<StreamdownProps, "content">;
