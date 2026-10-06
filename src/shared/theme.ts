import { z } from "zod";

/**
 * 外观主题：浅色调色板预设（强调色与灰阶随预设定死）+ 圆角、密度、画布纹理。renderer 把解析结果写到 :root 的 CSS 变量上，
 * 组件只消费 shadcn 语义 token。存储由主进程经 electron-store 落在平台用户数据目录。
 */
export const presetIds = ["sage", "neutral", "warm", "slate"] as const;
export const densities = ["compact", "standard", "comfortable"] as const;
export const radii = ["none", "sm", "md", "lg"] as const;
export const canvasPatterns = ["dots", "lines", "cross", "none"] as const;

export const appearanceSchema = z.object({
  preset: z.enum(presetIds).catch("sage"),
  density: z.enum(densities).catch("standard"),
  radius: z.enum(radii).catch("md"),
  canvas: z.enum(canvasPatterns).catch("dots"),
});
export type Appearance = z.infer<typeof appearanceSchema>;
export const defaultAppearance: Appearance = { preset: "sage", density: "standard", radius: "md", canvas: "dots" };

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

type Palette = Record<"background" | "foreground" | "card" | "primary" | "primary-foreground" | "secondary" | "muted" | "muted-foreground" | "accent" | "destructive" | "border" | "canvas-grid" | "selection", string>;

/** 预设是完整调色板：强调色、灰阶与前景色成组设计，不允许单独覆盖；popover、input、ring 等由 themeTokens 推出。 */
export const presets: Record<(typeof presetIds)[number], Palette> = {
  sage: {
    background: "#edf1f0", foreground: "#263c36", card: "#ffffff", primary: "#256651", "primary-foreground": "#ffffff",
    secondary: "#e7efeb", muted: "#e7efeb", "muted-foreground": "#4f6459", accent: "#e7efeb",
    destructive: "#8f403d", border: "#d3dfd9", "canvas-grid": "#c4cfca", selection: "#cae5d7",
  },
  neutral: {
    background: "#f4f4f5", foreground: "#18181b", card: "#ffffff", primary: "#18181b", "primary-foreground": "#ffffff",
    secondary: "#f0f0f1", muted: "#f0f0f1", "muted-foreground": "#5f5f68", accent: "#ececee",
    destructive: "#b42318", border: "#e2e2e5", "canvas-grid": "#d0d0d4", selection: "#dcdce0",
  },
  warm: {
    background: "#f3f0eb", foreground: "#2f2a24", card: "#fffdfa", primary: "#9a4f22", "primary-foreground": "#ffffff",
    secondary: "#ece6dd", muted: "#ece6dd", "muted-foreground": "#655b4f", accent: "#e9e2d7",
    destructive: "#a33a2c", border: "#ddd4c7", "canvas-grid": "#cfc6b8", selection: "#f0dcc8",
  },
  slate: {
    background: "#eef1f5", foreground: "#1e293b", card: "#ffffff", primary: "#2f5bb7", "primary-foreground": "#ffffff",
    secondary: "#e6ebf2", muted: "#e6ebf2", "muted-foreground": "#526077", accent: "#e3e9f2",
    destructive: "#b42318", border: "#d6dde7", "canvas-grid": "#c3ccd8", selection: "#cddcf5",
  },
};

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
/** 解析为完整 CSS 变量表；renderer 与主进程回退色共用。 */
export function themeTokens(appearance: Appearance): Record<string, string> {
  const palette = presets[appearance.preset];
  const fg = palette.foreground;
  return {
    ...palette,
    "card-foreground": fg, popover: palette.card, "popover-foreground": fg,
    ring: palette.primary,
    "secondary-foreground": fg, "accent-foreground": fg, input: palette.border,
    radius: `${radiusPx[appearance.radius]}px`,
  };
}
