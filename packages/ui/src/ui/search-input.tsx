import { Search } from "lucide-react";
import { cn } from "../utils";
import { Input } from "./input";

/**
 * 查找输入的公共组合；控件外观由官方 Input 提供。
 * `inline` 用于贴边嵌入面板顶部的筛选条：无边框与背景，图标与卡片标题图标同列（左缩进 12px），
 * 聚焦时由图标着色反馈，外层容器负责分隔线。
 */
export function SearchInput({ value, onChange, label, variant = "default" }: {
  value: string; onChange: (value: string) => void; label: string; variant?: "default" | "inline";
}) {
  const inline = variant === "inline";
  return <div className="group/search relative">
    <Search className={cn("pointer-events-none absolute size-4 text-muted-foreground",
      inline ? "top-1/2 left-3 -translate-y-1/2 group-focus-within/search:text-foreground" : "top-2.5 left-3")} aria-hidden="true" />
    <Input type="search" value={value} onChange={event => onChange(event.target.value)} aria-label={label} placeholder={label}
      className={cn("pl-9", inline && "h-8 rounded-none border-0 bg-transparent pr-3 shadow-none focus-visible:ring-0 dark:bg-transparent")} />
  </div>;
}
