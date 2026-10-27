import type { StreamdownProps } from "@lobehub/streamdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { externalWebUrl } from "@asterism/ui/links";

/** Historical and live content share standard Markdown plugins; body text and code are not rewritten before parsing. */
export const markdownOptions = {
  skipHtml: true,
  remarkPlugins: [remarkGfm, remarkMath],
  rehypePlugins: [[rehypeKatex, { trust: false }]],
  urlTransform: (url: string) => externalWebUrl(url) ?? "",
} satisfies Omit<StreamdownProps, "content">;
