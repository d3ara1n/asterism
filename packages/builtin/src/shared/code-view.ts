import { preloadHighlighter, type BaseCodeOptions, type SupportedLanguages } from "@pierre/diffs";

export const codeViewOptions = {
  theme: { light: "pierre-light", dark: "pierre-dark" },
  themeType: "system", preferredHighlighter: "shiki-js",
  disableFileHeader: true, overflow: "wrap",
} satisfies BaseCodeOptions;

/** Common grammars registered at startup; the library asynchronously adds highlighting for other languages on first use. */
const preloadedLanguages: SupportedLanguages[] = [
  "text", "typescript", "tsx", "javascript", "jsx", "json", "markdown", "css", "html",
  "python", "shellscript", "yaml", "toml", "rust", "go", "java", "c", "cpp", "sql", "xml",
];

let preparing: Promise<void> | null = null;
/** The shared highlighter registers themes and common grammars before the first screen, letting File and FileDiff render content synchronously on their first render. */
export function prepareCodeView(): Promise<void> {
  preparing ??= preloadHighlighter({
    themes: [codeViewOptions.theme.light, codeViewOptions.theme.dark],
    langs: preloadedLanguages,
  }).catch(error => { preparing = null; throw error; });
  return preparing;
}
