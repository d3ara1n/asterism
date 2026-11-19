import { resolveThemes } from "@pierre/diffs";

export const codeViewThemeOptions = {
  theme: { light: "pierre-light", dark: "pierre-dark" },
  preferredHighlighter: "shiki-js",
} as const;

/** Editable code adapts the same TextMate palettes used by read-only code and diffs. */
export function resolveCodeViewThemes() {
  const { theme, preferredHighlighter } = codeViewThemeOptions;
  return resolveThemes([theme.light, theme.dark], preferredHighlighter);
}
