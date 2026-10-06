import { presets, presetIds, type Appearance } from "../../../shared/theme";
import { s } from "../configuration/state";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "../../shared/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../shared/ui/select";
import { updateAppearance, useAppearance } from "./state";
import { cn } from "../../shared/utils";

const presetLabels: Record<Appearance["preset"], string> = {
  sage: s("Sage", "灰绿"), neutral: s("Neutral", "中性灰"), warm: s("Warm", "暖灰"), slate: s("Slate", "蓝灰"),
};

/** 外观设置：修改即保存并立即应用。 */
export function AppearanceSettings() {
  const appearance = useAppearance();
  return <div className="flex flex-col gap-6 pt-2">
    <section aria-label={s("Color preset", "配色预设")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {presetIds.map(id => {
        const palette = presets[id];
        return <button key={id} type="button" aria-pressed={appearance.preset === id} onClick={() => void updateAppearance({ preset: id })}
          className={cn("surface overflow-hidden p-0 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", appearance.preset === id && "border-primary ring-1 ring-primary")}>
          <span className="flex h-12 items-end gap-1 p-2" style={{ background: palette.background }}>
            <span className="h-6 flex-1 rounded-sm border" style={{ background: palette.card, borderColor: palette.border }} />
            <span className="size-6 rounded-sm" style={{ background: palette.primary }} />
          </span>
          <span className="block px-2 py-1.5 text-sm">{presetLabels[id]}</span>
        </button>;
      })}
    </section>
    <ItemGroup className="surface">
      <Row label={s("Corner radius", "圆角")}>
        <Choice value={appearance.radius} label={s("Corner radius", "圆角")} onChange={radius => void updateAppearance({ radius })}
          options={[["none", s("Square", "直角")], ["sm", s("Small", "小")], ["md", s("Medium", "中")], ["lg", s("Large", "大")]]} />
      </Row>
      <ItemSeparator />
      <Row label={s("Density", "密度")} hint={s("Scales spacing and text together.", "同时缩放间距与文字。")}>
        <Choice value={appearance.density} label={s("Density", "密度")} onChange={density => void updateAppearance({ density })}
          options={[["compact", s("Compact", "紧凑")], ["standard", s("Standard", "标准")], ["comfortable", s("Comfortable", "宽松")]]} />
      </Row>
      <ItemSeparator />
      <Row label={s("Canvas texture", "画布纹理")}>
        <Choice value={appearance.canvas} label={s("Canvas texture", "画布纹理")} onChange={canvas => void updateAppearance({ canvas })}
          options={[["dots", s("Dots", "点阵")], ["lines", s("Grid", "网格线")], ["cross", s("Crosses", "十字")], ["none", s("None", "无")]]} />
      </Row>
    </ItemGroup>
  </div>;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <Item size="sm"><ItemContent><ItemTitle>{label}</ItemTitle>{hint && <ItemDescription>{hint}</ItemDescription>}</ItemContent><ItemActions>{children}</ItemActions></Item>;
}

function Choice<T extends string>({ value, label, options, onChange }: { value: T; label: string; options: [T, string][]; onChange: (value: T) => void }) {
  return <Select value={value} onValueChange={next => onChange(next as T)}>
    <SelectTrigger size="sm" aria-label={label} className="w-32"><SelectValue /></SelectTrigger>
    <SelectContent align="end">{options.map(([v, text]) => <SelectItem key={v} value={v}>{text}</SelectItem>)}</SelectContent>
  </Select>;
}
