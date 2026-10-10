import { Search } from "lucide-react";
import { Input } from "./input";

/** 查找输入的公共组合；控件外观由官方 Input 提供。 */
export function SearchInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return <div className="relative">
    <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" aria-hidden="true" />
    <Input type="search" value={value} onChange={event => onChange(event.target.value)} aria-label={label} placeholder={label} className="pl-9" />
  </div>;
}
