import type { ReactNode } from "react";

/** 流式正文的公共尾部窗口：固定高度、顶部渐隐，内容随排版自然上移。 */
export function StreamingPreview({ children }: { children: ReactNode }) {
  return <div className="flex h-32 flex-col justify-end overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_1.5rem)]" inert aria-hidden="true">
    <div className="min-w-0 shrink-0">{children}</div>
  </div>;
}
