import * as radix from "@radix-ui/colors";
import { z } from "zod";

/**
 * 外观主题：亮暗模式 + 主题色（accent）+ 灰色（gray）+ 圆角、密度、画布纹理；色值来自 Radix Colors。renderer 把解析结果写到 :root 的 CSS 变量上，
 * 组件只消费 shadcn 语义 token。存储由主进程经 electron-store 落在平台用户数据目录。
 */
export const modes = ["system", "light", "dark"] as const;
export const accentIds = ["jade", "teal", "blue", "indigo", "violet", "crimson", "orange", "amber"] as const;
export const grayIds = ["gray", "sage", "slate", "sand", "mauve"] as const;
export const densities = ["compact", "standard", "comfortable"] as const;
export const radii = ["none", "sm", "md", "lg"] as const;
export const canvasPatterns = ["dots", "lines", "cross", "none"] as const;
export type Scheme = "light" | "dark";
export type AccentId = (typeof accentIds)[number];
export type GrayId = (typeof grayIds)[number];

export const appearanceSchema = z.object({
  mode: z.enum(modes).catch("system"),
  accent: z.enum(accentIds).catch("jade"),
  gray: z.enum(grayIds).catch("sage"),
  density: z.enum(densities).catch("standard"),
  radius: z.enum(radii).catch("md"),
  canvas: z.enum(canvasPatterns).catch("dots"),
});
export type Appearance = z.infer<typeof appearanceSchema>;
export const defaultAppearance: Appearance = { mode: "system", accent: "jade", gray: "sage", density: "standard", radius: "md", canvas: "dots" };

/** 读取的原始数据不可信：逐项回退到默认值，不因单项损坏丢弃整份设置。 */
export function parseAppearance(raw: unknown): Appearance {
  const result = appearanceSchema.safeParse(raw && typeof raw === "object" ? raw : {});
  return result.success ? result.data : defaultAppearance;
}

export const appearancePatchSchema = appearanceSchema.partial().strict();
export type AppearancePatch = z.infer<typeof appearancePatchSchema>;

export const appearanceGetChannel = "weft:appearance:get";
export const appearanceSetChannel = "weft:appearance:set";
export const appearanceChangedChannel = "weft:appearance:changed";

export interface AppearanceBridge {
  get(): Promise<Appearance>;
  set(patch: AppearancePatch): Promise<Appearance>;
  onChanged(listener: (appearance: Appearance) => void): () => void;
}

/** 命名调色板：主题色与灰色的推荐组合，只是快捷写入 accent + gray，不进存储、无选中态。 */
export const palettes: readonly { id: string; name: [en: string, zh: string]; accent: AccentId; gray: GrayId }[] = [
  { id: "tundra", name: ["Tundra", "苔原"], accent: "jade", gray: "sage" },
  { id: "sky", name: ["Clear sky", "晴空"], accent: "blue", gray: "slate" },
  { id: "terracotta", name: ["Terracotta", "陶土"], accent: "orange", gray: "sand" },
  { id: "dusk", name: ["Dusk", "暮紫"], accent: "violet", gray: "mauve" },
  { id: "ink", name: ["Ink", "墨白"], accent: "indigo", gray: "gray" },
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
/** 实色主色上的文字：在白与深灰之间取对比度更高者（琥珀等亮色上自动用深色字）。 */
function onSolid(background: string, dark: string): string {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, dark) ? "#ffffff" : dark;
}
/** 语义层：唯一一份映射，把 accent/gray 色阶按亮暗解析为 shadcn token；token 名不随任何选择改变。 */
export function themeTokens(appearance: Appearance, scheme: Scheme): Record<string, string> {
  const g = scale(appearance.gray, scheme);
  const a = scale(appearance.accent, scheme);
  const red = scale("red", scheme);
  const dark = scheme === "dark";
  // 亮色用 11 级保证白字 AA；暗色用 9 级实色，文字色按对比度选。
  const primary = dark ? a(9) : a(11);
  const fg = g(12);
  return {
    background: dark ? g(1) : g(3), foreground: fg,
    card: dark ? g(2) : "#ffffff", "card-foreground": fg,
    popover: dark ? g(3) : "#ffffff", "popover-foreground": fg,
    primary, "primary-foreground": onSolid(primary, scale(appearance.gray, "dark")(1)),
    secondary: g(4), "secondary-foreground": fg,
    muted: g(3), "muted-foreground": g(11),
    accent: g(4), "accent-foreground": fg,
    destructive: red(11), border: g(6), input: g(7), ring: a(8),
    "canvas-grid": g(6), selection: a(5),
    radius: `${radiusPx[appearance.radius]}px`,
  };
}
