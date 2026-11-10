import type { StreamdownProps } from "@lobehub/streamdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

/** Historical and live content share standard Markdown plugins; body text and code are not rewritten before parsing. */
export const markdownOptions = {
  skipHtml: true,
  // Single dollars are literal text (currency and shell variables); formulas use $$ delimiters.
  remarkPlugins: [remarkGfm, [remarkMath, { singleDollarTextMath: false }]],
  rehypePlugins: [[rehypeKatex, { trust: false }]],
  // Destinations pass through unchanged; the `a` and `img` components decide what each one becomes.
  urlTransform: (url: string) => url,
} satisfies Omit<StreamdownProps, "content">;
