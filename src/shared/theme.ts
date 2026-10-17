import * as radix from "@radix-ui/colors";
import { z } from "zod";
import { coreChannel } from "./core.ts";

/**
 * 外观设置：主题、字体、画布纹理与过程展示偏好。主题色值来自 Radix Colors，renderer 写入 :root 的 CSS 变量，
 * 组件消费 shadcn 语义 token。存储由主进程经 electron-store 落在平台用户数据目录。
 */
export const modes = ["system", "light", "dark"] as const;
/** 主题色按色相环排列；graphite 不对应 Radix 色相，表示以所选灰阶作主色的无彩模式。 */
export const accentIds = ["blue", "cyan", "teal", "jade", "grass", "amber", "orange", "tomato", "crimson", "plum", "violet", "indigo", "graphite"] as const;
export const grayIds = ["gray", "slate", "sage", "olive", "sand", "mauve"] as const;
export const densities = ["compact", "standard", "comfortable"] as const;
export const radii = ["none", "sm", "md", "lg"] as const;
export const canvasPatterns = ["dots", "lines", "cross", "none"] as const;
export type Scheme = "light" | "dark";
export type AccentId = (typeof accentIds)[number];
export type GrayId = (typeof grayIds)[number];

export const codeFontSizes = [11, 12, 13, 14, 15, 16, 18] as const;
export type CodeFontSize = (typeof codeFontSizes)[number];
const fontFamilySchema = z.string().trim().min(1).max(128).nullable().default(null);

/** 默认字体栈；用户字体只前置，不替换回退。 */
export const sansStack = `system-ui, -apple-system, "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Noto Sans CJK SC", sans-serif`;
export const monoStack = `ui-monospace, "SF Mono", Menlo, Consolas, "Cascadia Mono", "Noto Sans Mono CJK SC", monospace`;
/** 字体名作为 CSS 字符串转义后加引号，防止注入。 */
export function fontStack(family: string | null, fallback: string): string {
  if (!family) return fallback;
  return `"${family.replace(/[\\"]/g, "\\$&").replace(/[\n\r\f]/g, " ")}", ${fallback}`;
}

export const appearanceSchema = z.object({
  mode: z.enum(modes).catch("system"),
  accent: z.enum(accentIds).catch("jade"),
  gray: z.enum(grayIds).catch("gray"),
  density: z.enum(densities).catch("standard"),
  radius: z.enum(radii).catch("md"),
  canvas: z.enum(canvasPatterns).catch("dots"),
  /** 本机字体家族名；null 为系统默认栈。 */
  uiFont: fontFamilySchema.catch(null),
  codeFont: fontFamilySchema.catch(null),
  /** 代码字号（px），null 跟随所在界面文字。 */
  codeFontSize: z.number().int().min(codeFontSizes[0]).max(codeFontSizes[codeFontSizes.length - 1]).nullable().default(null).catch(null),
});
export type Appearance = z.infer<typeof appearanceSchema>;
export const defaultAppearance: Appearance = { mode: "system", accent: "jade", gray: "gray", density: "standard", radius: "md", canvas: "dots", uiFont: null, codeFont: null, codeFontSize: null };

/** 读取的原始数据不可信：逐项回退到默认值，不因单项损坏丢弃整份设置。 */
export function parseAppearance(raw: unknown): Appearance {
  const result = appearanceSchema.safeParse(raw && typeof raw === "object" ? raw : {});
  return result.success ? result.data : defaultAppearance;
}

export const appearancePatchSchema = appearanceSchema.partial().strict();
export type AppearancePatch = z.infer<typeof appearancePatchSchema>;

export const appearanceGetChannel = coreChannel("appearance:get");
export const appearanceSetChannel = coreChannel("appearance:set");
export const appearanceChangedChannel = coreChannel("appearance:changed");

export interface AppearanceBridge {
  get(): Promise<Appearance>;
  set(patch: AppearancePatch): Promise<Appearance>;
  onChanged(listener: (appearance: Appearance) => void): () => void;
}

/** 命名调色板：主题色与灰色的推荐组合，只是快捷写入 accent + gray，不进存储、无选中态。多数配中性灰，暖色与紫色系配同调灰。 */
export const palettes: readonly { id: string; accent: AccentId; gray: GrayId }[] = [
  { id: "tundra", accent: "jade", gray: "gray" },
  { id: "graphite", accent: "graphite", gray: "gray" },
  { id: "sky", accent: "blue", gray: "slate" },
  { id: "ink", accent: "indigo", gray: "gray" },
  { id: "lagoon", accent: "cyan", gray: "slate" },
  { id: "celadon", accent: "teal", gray: "gray" },
  { id: "meadow", accent: "grass", gray: "olive" },
  { id: "honey", accent: "amber", gray: "sand" },
  { id: "terracotta", accent: "orange", gray: "sand" },
  { id: "coral", accent: "tomato", gray: "mauve" },
  { id: "rose", accent: "crimson", gray: "gray" },
  { id: "dusk", accent: "violet", gray: "mauve" },
];

/** 原始层：Radix Colors 12 级色阶，下标 1–12；亮暗两套同级用途相同。 */
type Scale = (step: number) => string;
function scale(name: string, scheme: Scheme): Scale {
  const table = (radix as unknown as Record<string, Record<string, string>>)[scheme === "dark" ? `${name}Dark` : name]!;
  return step => table[`${name}${step}`]!;
}
const radiusPx: Record<Appearance["radius"], number> = { none: 2, sm: 5, md: 8, lg: 12 };
/** 密度缩放根字号：Tailwind 的间距与字号均以 rem 计，组件源码不改即可整体缩放。 */
export const densityRootPx: Record<Appearance["density"], number> = { compact: 13, standard: 14, comfortable: 16 };

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
/** WCAG 2.x 对比度。 */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
/** 实色主色上的文字：在白与深灰之间取对比度更高者，9 级的明亮色相（jade、blue、orange 等）上自动用深色字。 */
function onSolid(background: string, dark: string): string {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, dark) ? "#ffffff" : dark;
}
/** 图表分类色相顺序；docs/design-system.md#数据图表。 */
export const chartHues = ["blue", "teal", "amber", "violet", "crimson", "orange", "cyan", "plum"] as const;
/** 语义层：唯一一份映射，把 accent/gray 色阶按亮暗解析为 shadcn token；token 名不随任何选择改变。 */
export function themeTokens(appearance: Appearance, scheme: Scheme): Record<string, string> {
  const g = scale(appearance.gray, scheme);
  const mono = appearance.accent === "graphite";
  const a = mono ? g : scale(appearance.accent, scheme);
  const red = scale("red", scheme);
  const green = scale("green", scheme);
  const amber = scale("amber", scheme);
  const dark = scheme === "dark";
  // 亮色用 11 级保证白字与作文字色时 AA；暗色用 9 级实色，文字色按对比度选。石墨以 12 级（近黑／近白）作主色。
  const primary = mono ? g(12) : dark ? a(9) : a(11);
  const fg = g(12);
  return {
    // background 遵循 shadcn 约定作页面底色（亮色白）；canvas 为工坊扩展，只给工作台底板等画布区域。
    background: dark ? g(1) : "#ffffff", foreground: fg, canvas: dark ? g(1) : g(3),
    card: dark ? g(2) : "#ffffff", "card-foreground": fg,
    popover: dark ? g(3) : "#ffffff", "popover-foreground": fg,
    primary, "primary-foreground": onSolid(primary, scale(appearance.gray, "dark")(1)),
    // 当前项与标签：主题色浅底；亮色用 12 级、暗色用 11 级文字保证 AA。石墨用比 hover（4 级）深一级的灰底，与悬停可分辨。
    ...(mono
      ? { secondary: g(5), "secondary-foreground": fg }
      : { secondary: a(3), "secondary-foreground": dark ? a(11) : a(12) }),
    muted: g(3), "muted-foreground": g(11),
    accent: g(4), "accent-foreground": fg,
    // 状态色统一取 11 级：亮暗两侧均可作文字与图标色。亮色边框退一级，弱化表面描边。
    destructive: red(11), success: green(11), warning: amber(11),
    border: dark ? g(6) : g(5), input: dark ? g(7) : g(6), ring: a(8),
    "canvas-grid": g(6), selection: mono ? g(6) : a(5),
    // 图表分类色：固定色相第 9 级，不随主题色与灰色变化；只用于图形填充。
    ...Object.fromEntries(chartHues.map((hue, index) => [`chart-${index + 1}`, scale(hue, scheme)(9)])),
    radius: `${radiusPx[appearance.radius]}px`,
  };
}
