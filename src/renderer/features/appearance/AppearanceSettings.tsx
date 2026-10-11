import { useState, type CSSProperties } from "react";
import { Bot, FileText, Monitor, Moon, Sun } from "lucide-react";
import { accentIds, codeFontSizes, grayIds, palettes, themeTokens, type AccentId, type CodeFontSize, type Appearance, type GrayId } from "../../../shared/theme";
import { s } from "../../shared/i18n";
import { Section } from "../settings/preview";
import { Button } from "../../shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../shared/ui/dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "../../shared/ui/item";
import { ToggleGroup, ToggleGroupItem } from "../../shared/ui/toggle-group";
import { FontPicker } from "../../shared/ui/font-picker";
import { Switch } from "../../shared/ui/switch";
import { t } from "../../shared/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../shared/ui/select";
import { ColorSwatch, SwatchGroup, TileSwatch } from "../../shared/ui/swatch";
import { updateAppearance, useAppearance, useScheme } from "./state";

const accentLabels: Record<AccentId, string> = {
  jade: s("Jade", "玉绿"), teal: s("Teal", "青"), blue: s("Blue", "蓝"), indigo: s("Indigo", "靛蓝"),
  violet: s("Violet", "紫"), crimson: s("Crimson", "绯红"), orange: s("Orange", "橙"), amber: s("Amber", "琥珀"),
};
const grayLabels: Record<GrayId, string> = {
  gray: s("Neutral", "中性灰"), sage: s("Sage", "灰绿"), slate: s("Slate", "蓝灰"), sand: s("Sand", "暖灰"), mauve: s("Mauve", "紫灰"),
};
const fontText = {
  defaultLabel: s("System default", "系统默认"),
  searchPlaceholder: s("Search fonts", "搜索字体"),
  emptyText: s("No matching fonts.", "没有匹配的字体。"),
  unavailableText: s("Installed fonts are unavailable.", "无法读取本机字体。"),
};
const radiusCorner: Record<Appearance["radius"], string> = { none: "0px", sm: "3px", md: "5px", lg: "8px" };

/** 画布纹理的 CSS 示意，与 React Flow Background 三种变体对应；颜色取 --canvas-grid。 */
function texture(kind: Appearance["canvas"], gap = 12): CSSProperties {
  const c = "var(--canvas-grid)";
  if (kind === "dots") return { backgroundImage: `radial-gradient(circle, ${c} 1px, transparent 1.2px)`, backgroundSize: `${gap}px ${gap}px` };
  if (kind === "lines") return { backgroundImage: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`, backgroundSize: `${gap}px ${gap}px` };
  if (kind === "cross") {
    const arm = `linear-gradient(${c}, ${c})`;
    return { backgroundImage: `${arm}, ${arm}`, backgroundSize: "6px 1px, 1px 6px", backgroundRepeat: "no-repeat",
      backgroundPosition: "center", maskImage: undefined, ...crossTile(gap) };
  }
  return {};
}
/** 十字需要平铺：用重复的 SVG 绘制，避免渐变无法单格居中重复。 */
function crossTile(gap: number): CSSProperties {
  const h = gap / 2;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${gap}' height='${gap}'><path d='M${h - 3} ${h}H${h + 3}M${h} ${h - 3}V${h + 3}' stroke='black' stroke-width='1'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return { backgroundImage: "none", backgroundColor: "var(--canvas-grid)", maskImage: url, maskSize: `${gap}px ${gap}px`, WebkitMaskImage: url, WebkitMaskSize: `${gap}px ${gap}px` };
}
function Texture({ kind, gap }: { kind: Appearance["canvas"]; gap?: number }) {
  return <span aria-hidden="true" className="absolute inset-0" style={texture(kind, gap)} />;
}

/** 外观设置：修改即保存并立即应用；顶部预览随全部选项实时变化。 */
export function AppearanceSettings() {
  const appearance = useAppearance();
  const scheme = useScheme();
  const [picking, setPicking] = useState(false);
  return <div className="flex flex-col">
    <LivePreview appearance={appearance} />

    <Section title={s("Color", "颜色")} action={<Button size="sm" variant="outline" onClick={() => setPicking(true)}>{s("Choose palette", "选择调色板")}</Button>}>
      <ItemGroup className="surface">
        <Row label={s("Mode", "模式")} hint={s("Window material follows this choice.", "窗口材质同步切换。")}>
          <ToggleGroup type="single" variant="outline" size="sm" aria-label={s("Mode", "模式")} value={appearance.mode}
            onValueChange={mode => mode && void updateAppearance({ mode: mode as Appearance["mode"] })}>
            <ToggleGroupItem value="system" className="px-2.5"><Monitor />{s("System", "跟随系统")}</ToggleGroupItem>
            <ToggleGroupItem value="light" className="px-2.5"><Sun />{s("Light", "浅色")}</ToggleGroupItem>
            <ToggleGroupItem value="dark" className="px-2.5"><Moon />{s("Dark", "深色")}</ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <ItemSeparator />
        <Row label={s("Accent color", "主题色")} hint={accentLabels[appearance.accent]}>
          <SwatchGroup aria-label={s("Accent color", "主题色")} value={appearance.accent} onValueChange={accent => void updateAppearance({ accent: accent as AccentId })}>
            {accentIds.map(id => <ColorSwatch key={id} value={id} label={accentLabels[id]} className="border-transparent">
              <span className="absolute inset-0" style={{ background: themeTokens({ ...appearance, accent: id }, scheme).primary }} />
            </ColorSwatch>)}
          </SwatchGroup>
        </Row>
        <ItemSeparator />
        <Row label={s("Gray", "灰色")} hint={grayLabels[appearance.gray]}>
          <SwatchGroup aria-label={s("Gray", "灰色")} value={appearance.gray} onValueChange={gray => void updateAppearance({ gray: gray as GrayId })}>
            {grayIds.map(id => {
              const t = themeTokens({ ...appearance, gray: id }, scheme);
              return <ColorSwatch key={id} value={id} label={grayLabels[id]}>
                <span className="absolute inset-0 flex">
                  <span className="flex-1" style={{ background: t.background }} />
                  <span className="flex-1" style={{ background: t.border }} />
                  <span className="flex-1" style={{ background: t["muted-foreground"] }} />
                </span>
              </ColorSwatch>;
            })}
          </SwatchGroup>
        </Row>
      </ItemGroup>
    </Section>

    <Section title={s("Shape", "形状")}>
      <ItemGroup className="surface">
        <Row label={s("Corner radius", "圆角")}>
          <ToggleGroup type="single" variant="outline" size="sm" aria-label={s("Corner radius", "圆角")} value={appearance.radius}
            onValueChange={radius => radius && void updateAppearance({ radius: radius as Appearance["radius"] })}>
            {([["none", s("Square", "直角")], ["sm", s("Small", "小")], ["md", s("Medium", "中")], ["lg", s("Large", "大")]] as const).map(([v, text]) =>
              <ToggleGroupItem key={v} value={v} aria-label={text} title={text} className="px-2.5">
                <span aria-hidden="true" className="size-3.5 border-t-2 border-l-2 border-current" style={{ borderTopLeftRadius: radiusCorner[v] }} />
              </ToggleGroupItem>)}
          </ToggleGroup>
        </Row>
        <ItemSeparator />
        <Row label={s("Density", "密度")} hint={s("Scales spacing and text together.", "同时缩放间距与文字。")}>
          <ToggleGroup type="single" variant="outline" size="sm" aria-label={s("Density", "密度")} value={appearance.density}
            onValueChange={density => density && void updateAppearance({ density: density as Appearance["density"] })}>
            <ToggleGroupItem value="compact" className="px-2.5">{s("Compact", "紧凑")}</ToggleGroupItem>
            <ToggleGroupItem value="standard" className="px-2.5">{s("Standard", "标准")}</ToggleGroupItem>
            <ToggleGroupItem value="comfortable" className="px-2.5">{s("Comfortable", "宽松")}</ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </ItemGroup>
    </Section>

    <Section title={s("Fonts", "字体")} hint={s("Markdown uses the interface font for text and the code font for code.", "Markdown 正文使用界面字体，代码使用代码字体。")}>
      <ItemGroup className="surface">
        <Row label={s("Interface font", "界面字体")}>
          <FontPicker aria-label={s("Interface font", "界面字体")} value={appearance.uiFont} onValueChange={uiFont => void updateAppearance({ uiFont })} {...fontText} />
        </Row>
        <ItemSeparator />
        <Row label={s("Code font", "代码字体")}>
          <Select value={appearance.codeFontSize ? String(appearance.codeFontSize) : "auto"}
            onValueChange={v => void updateAppearance({ codeFontSize: v === "auto" ? null : Number(v) as CodeFontSize })}>
            <SelectTrigger size="sm" className="w-24" aria-label={s("Code font size", "代码字号")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{s("Auto", "跟随")}</SelectItem>
              {codeFontSizes.map(size => <SelectItem key={size} value={String(size)}>{size} px</SelectItem>)}
            </SelectContent>
          </Select>
          <FontPicker aria-label={s("Code font", "代码字体")} monospaceOnly showAllLabel={s("Show all fonts", "显示全部字体")}
            value={appearance.codeFont} onValueChange={codeFont => void updateAppearance({ codeFont })} {...fontText} />
        </Row>
      </ItemGroup>
    </Section>

    <Section title={s("Canvas", "画布")} hint={s("Background texture of the workbench.", "工作台的背景纹理。")}>
      <SwatchGroup aria-label={s("Canvas texture", "画布纹理")} value={appearance.canvas} onValueChange={canvas => void updateAppearance({ canvas: canvas as Appearance["canvas"] })}>
        {([["dots", s("Dots", "点阵")], ["lines", s("Grid", "网格线")], ["cross", s("Crosses", "十字")], ["none", s("None", "无")]] as const).map(([v, text]) =>
          <TileSwatch key={v} value={v} label={text}><Texture kind={v} /></TileSwatch>)}
      </SwatchGroup>
    </Section>

    <Section title={t.thinkingTitle} hint={t.thinkingPreviewHint}>
      <ItemGroup className="surface">
        <Row label={t.thinkingAutoExpand} hint={t.thinkingAutoExpandHint}>
          <Switch checked={appearance.thinkingAutoExpand} aria-label={t.thinkingAutoExpand}
            onCheckedChange={thinkingAutoExpand => void updateAppearance({ thinkingAutoExpand })} />
        </Row>
        <ItemSeparator />
        <Row label={t.thinkingAutoCollapse} hint={t.thinkingAutoCollapseHint}>
          <Switch checked={appearance.thinkingAutoCollapse} aria-label={t.thinkingAutoCollapse}
            onCheckedChange={thinkingAutoCollapse => void updateAppearance({ thinkingAutoCollapse })} />
        </Row>
      </ItemGroup>
    </Section>

    <PaletteDialog open={picking} onOpenChange={setPicking} appearance={appearance} />
  </div>;
}

/** 实时预览：一块画布 + 对象卡片 + 主按钮，直接消费当前 token，因此圆角、密度、亮暗都会反映。 */
/**
 * 实时预览：一个缩小的工作台场景。笔记资源经连线授权给代理，代理卡片展示待运行状态；
 * 每个元素对应一类 token：画布纹理、卡片、边框、次要文字、主色与连线。
 */
function LivePreview({ appearance }: { appearance: Appearance }) {
  return <div aria-hidden="true" className="surface relative mt-2 overflow-hidden bg-background">
    <Texture kind={appearance.canvas} gap={20} />
    <div className="relative flex items-center px-8 py-7">
      <div className="w-48 shrink-0 rounded-lg border bg-card p-3 shadow-sm">
        <p className="type-label flex items-center gap-1.5 text-muted-foreground"><FileText className="size-3.5" />{s("Note", "笔记")}</p>
        <p className="type-section mt-1 truncate">{s("Launch checklist", "发布清单")}</p>
        <div className="mt-2 space-y-1.5">
          <span className="block h-1.5 w-full rounded-full bg-muted" />
          <span className="block h-1.5 w-4/5 rounded-full bg-muted" />
          <span className="block h-1.5 w-3/5 rounded-full bg-muted" />
        </div>
      </div>
      {/* 连线：资源端到代理端，带两端连接点与授权标签。 */}
      <div className="relative flex min-w-16 flex-1 items-center">
        <span className="size-2 shrink-0 rounded-full border-2 border-card bg-primary" />
        <span className="h-px flex-1 border-t-[1.5px] border-dashed border-primary" />
        <span className="size-2 shrink-0 rounded-full border-2 border-card bg-primary" />
        <span className="absolute left-1/2 -translate-x-1/2 -translate-y-4 rounded-sm bg-background px-1 text-[10px] text-muted-foreground">{s("read", "可读")}</span>
      </div>
      <div className="w-52 shrink-0 rounded-lg border bg-card shadow-sm">
        <div className="flex items-center gap-1.5 p-3 pb-2">
          <Bot className="size-3.5 text-muted-foreground" />
          <p className="type-section min-w-0 flex-1 truncate">{s("Reviewer", "审阅代理")}</p>
          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">{s("Ready", "就绪")}</span>
        </div>
        <p className="type-caption px-3">{s("1 resource attached", "已绑定 1 个资源")}</p>
        <p className="mx-3 mt-1.5 truncate rounded-sm bg-muted px-1.5 py-0.5 text-[11px]"><span className="type-code text-muted-foreground">read("checklist.md")</span></p>
        <div className="mt-2 flex justify-end gap-1.5 border-t p-2">
          <span className="rounded-md border bg-card px-2.5 py-1 text-xs">{s("Edit", "编辑")}</span>
          <span className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground">{s("Run", "运行")}</span>
        </div>
      </div>
    </div>
  </div>;
}

/** 调色板只是快捷组合：无选中态，选一项即写入 accent + gray 并关闭。 */
function PaletteDialog({ open, onOpenChange, appearance }: { open: boolean; onOpenChange: (open: boolean) => void; appearance: Appearance }) {
  const scheme = useScheme();
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{s("Choose palette", "选择调色板")}</DialogTitle>
        <DialogDescription>{s("Sets the accent color and gray. You can still adjust each afterwards.", "设置主题色与灰色，之后仍可单独调整。")}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {palettes.map(palette => {
          const t = themeTokens({ ...appearance, accent: palette.accent, gray: palette.gray }, scheme);
          const name = s(...palette.name);
          return <button key={palette.id} type="button"
            onClick={() => { void updateAppearance({ accent: palette.accent, gray: palette.gray }); onOpenChange(false); }}
            className="overflow-hidden rounded-md border bg-card text-left outline-none transition-colors hover:border-ring/60 focus-visible:ring-[3px] focus-visible:ring-ring/50">
            {/* 迷你界面：底色、卡片、主色条与次要文字条。 */}
            <span aria-hidden="true" className="flex h-16 gap-1.5 p-2" style={{ background: t.background }}>
              <span className="flex flex-1 flex-col gap-1 rounded-sm border p-1.5" style={{ background: t.card, borderColor: t.border }}>
                <span className="h-1.5 w-3/4 rounded-full" style={{ background: t.foreground }} />
                <span className="h-1 w-1/2 rounded-full" style={{ background: t["muted-foreground"] }} />
                <span className="mt-auto h-2 w-8 rounded-sm" style={{ background: t.primary }} />
              </span>
              <span className="w-3 rounded-sm" style={{ background: t.secondary }} />
            </span>
            <span className="block px-2 py-1.5 text-sm">{name}</span>
          </button>;
        })}
      </div>
    </DialogContent>
  </Dialog>;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <Item size="sm"><ItemContent><ItemTitle>{label}</ItemTitle>{hint && <ItemDescription>{hint}</ItemDescription>}</ItemContent><ItemActions>{children}</ItemActions></Item>;
}
