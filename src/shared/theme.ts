import * as radix from "@radix-ui/colors";
import { z } from "zod";
import { coreChannel } from "./core.ts";

/**
 * Appearance settings: theme, fonts, canvas texture, and progress display preferences. Radix Colors supplies theme values; renderers write CSS variables to :root,
 * and components consume shadcn semantic tokens. Main processes persist settings through electron-store in platform user data directories.
 */
export const modes = ["system", "light", "dark"] as const;
/** Theme colors follow hue-wheel order; graphite has no Radix hue and represents achromatic mode with the selected grayscale as accent. */
export const accentIds = ["blue", "cyan", "teal", "jade", "grass", "amber", "orange", "tomato", "crimson", "plum", "violet", "indigo", "graphite"] as const;
export const grayIds = ["gray", "slate", "sage", "olive", "sand", "mauve"] as const;
export const densities = ["compact", "standard", "comfortable"] as const;
export const radii = ["none", "sm", "md", "lg"] as const;
export const canvasPatterns = ["dots", "lines", "cross", "none"] as const;
export const edgeStyles = ["default", "step", "smoothstep"] as const;
export type Scheme = "light" | "dark";
export type AccentId = (typeof accentIds)[number];
export type GrayId = (typeof grayIds)[number];

export const fontSizeRange = { min: 1, max: 100 } as const;
export const defaultFontSize = 12;
const fontFamilySchema = z.string().trim().min(1).max(128).nullable();

/** Default font stack; user fonts prepend without replacing fallbacks. */
export const sansStack = `system-ui, -apple-system, "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Noto Sans CJK SC", sans-serif`;
export const monoStack = `ui-monospace, "SF Mono", Menlo, Consolas, "Cascadia Mono", "Noto Sans Mono CJK SC", monospace`;
/** Escape font names as quoted CSS strings to prevent injection. */
export function fontStack(family: string | null, fallback: string): string {
  if (!family) return fallback;
  return `"${family.replace(/[\\"]/g, "\\$&").replace(/[\n\r\f]/g, " ")}", ${fallback}`;
}

export const appearanceSchema = z.object({
  mode: z.enum(modes).catch("system"),
  accent: z.enum(accentIds).catch("graphite"),
  gray: z.enum(grayIds).catch("gray"),
  density: z.enum(densities).catch("standard"),
  /** Read entries fill platform-specific values when unset or invalid. */
  radius: z.enum(radii).optional().catch(undefined),
  canvas: z.enum(canvasPatterns).catch("dots"),
  edgeStyle: z.enum(edgeStyles).catch("default"),
  /** Local font family name; null means the system default stack. */
  uiFont: fontFamilySchema.catch(null),
  terminalFont: fontFamilySchema.catch(null),
  /** Terminal font size is fixed in px, independent of UI density and code font size. */
  terminalFontSize: z.number().min(fontSizeRange.min).max(fontSizeRange.max).catch(defaultFontSize),
  codeFont: fontFamilySchema.catch(null),
  /** Code font size in px; null follows surrounding UI text. */
  codeFontSize: z.number().min(fontSizeRange.min).max(fontSizeRange.max).nullable().catch(null),
});
export type Appearance = z.infer<typeof appearanceSchema> & { radius: (typeof radii)[number] };

export function defaultAppearance(platform: string): Appearance {
  return parseAppearance({}, platform);
}

/** Raw read data is untrusted: fall back per field without discarding all settings for one corrupt entry. */
export function parseAppearance(raw: unknown, platform: string): Appearance {
  const result = appearanceSchema.safeParse(raw && typeof raw === "object" ? raw : {});
  const data = result.success ? result.data : appearanceSchema.parse({});
  return { ...data, radius: data.radius ?? (platform === "darwin" ? "lg" : platform === "win32" ? "md" : "sm") };
}

/** Omitted patch fields stay absent; read fallbacks use catch rather than defaults that partial parsing would materialize. */
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

/** Named palettes recommend accent/gray combinations as shortcuts writing accent + gray, without persistence or selected state. Most use neutral gray; warm and purple colors use matching grays. */
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

/** Primitive layer: 12 Radix Colors steps indexed 1–12; light and dark variants share step purposes. */
type Scale = (step: number) => string;
function scale(name: string, scheme: Scheme): Scale {
  const table = (radix as unknown as Record<string, Record<string, string>>)[scheme === "dark" ? `${name}Dark` : name]!;
  return step => table[`${name}${step}`]!;
}
const radiusPx: Record<Appearance["radius"], number> = { none: 2, sm: 5, md: 8, lg: 12 };
/** Density scales root font size: Tailwind spacing and fonts use rem, scaling the whole UI without component source changes. */
export const densityRootPx: Record<Appearance["density"], number> = { compact: 13, standard: 14, comfortable: 16 };

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
/** WCAG 2.x contrast ratio. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
/** Text on solid surfaces: choose the higher-contrast option between white and dark gray. */
function onSolid(background: string, dark: string): string {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, dark) ? "#ffffff" : dark;
}
/** Chart categorical hue order. */
export const chartHues = ["blue", "teal", "amber", "violet", "crimson", "orange", "cyan", "plum"] as const;
/** Semantic layer: one mapping resolves accent/gray steps into shadcn tokens for light/dark modes; token names never change with selections. */
export function themeTokens(appearance: Appearance, scheme: Scheme): Record<string, string> {
  const g = scale(appearance.gray, scheme);
  const mono = appearance.accent === "graphite";
  const a = mono ? g : scale(appearance.accent, scheme);
  const red = scale("red", scheme);
  const green = scale("green", scheme);
  const amber = scale("amber", scheme);
  const dark = scheme === "dark";
  // Light mode uses step 11 for AA white text on solid surfaces; dark mode uses step 9. Graphite uses step 12 (near-black/near-white) as accent.
  const primary = mono ? g(12) : dark ? a(9) : a(11);
  const fg = g(12);
  const primaryText = mono ? fg : dark ? a(11) : a(12);
  const darkForeground = scale(appearance.gray, "dark")(1);
  const solidForeground = (background: string) => onSolid(background, darkForeground);
  return {
    // background follows shadcn's page background convention (white in light mode); canvas is Asterism's extension for workbench bases and other canvas areas only.
    background: dark ? g(1) : "#ffffff", foreground: fg, canvas: dark ? g(1) : g(3),
    card: dark ? g(2) : "#ffffff", "card-foreground": fg,
    // Canvas card shells sit between canvas and content surfaces; light mode must differ from canvas or only borders define outlines.
    "card-shell": dark ? g(3) : g(2),
    popover: dark ? g(3) : "#ffffff", "popover-foreground": fg,
    primary, "primary-foreground": solidForeground(primary),
    // Solid fills and emphasized surface text use separate colors to avoid insufficient contrast with dark-mode step 9 small text.
    "primary-text": primaryText,
    secondary: g(3), "secondary-foreground": fg,
    // Persistent selection is independent of neutral secondary surfaces and hover; graphite uses a gray one step deeper than hover (step 4).
    selected: mono ? g(5) : a(3), "selected-foreground": primaryText,
    muted: g(3), "muted-foreground": g(11),
    "external-message": scale("violet", scheme)(3), "external-message-foreground": scale("violet", scheme)(12),
    accent: g(4), "accent-foreground": fg,
    // Status colors consistently use step 11 with independent foregrounds for solid surfaces.
    destructive: red(11), "destructive-foreground": solidForeground(red(11)),
    success: green(11), "success-foreground": solidForeground(green(11)),
    warning: amber(11), "warning-foreground": solidForeground(amber(11)),
    border: dark ? g(6) : g(5), input: dark ? g(7) : g(6), ring: a(8),
    "canvas-grid": g(6), selection: mono ? g(6) : a(5),
    // Chart categories use fixed hues at step 9, independent of accent and gray choices, for graphical fills only.
    ...Object.fromEntries(chartHues.map((hue, index) => [`chart-${index + 1}`, scale(hue, scheme)(9)])),
    radius: `${radiusPx[appearance.radius]}px`,
  };
}
