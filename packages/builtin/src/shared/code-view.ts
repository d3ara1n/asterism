import { preloadHighlighter, type BaseCodeOptions, type SupportedLanguages } from "@pierre/diffs";

export const codeViewOptions = {
  theme: { light: "pierre-light", dark: "pierre-dark" },
  themeType: "system", preferredHighlighter: "shiki-js",
  disableFileHeader: true, overflow: "wrap",
} satisfies BaseCodeOptions;

/** 启动时挂载的常用语法；其余语言由库在首次使用时异步补齐着色。 */
const preloadedLanguages: SupportedLanguages[] = [
  "text", "typescript", "tsx", "javascript", "jsx", "json", "markdown", "css", "html",
  "python", "shellscript", "yaml", "toml", "rust", "go", "java", "c", "cpp", "sql", "xml",
];

let preparing: Promise<void> | null = null;
/** 共享高亮器在首屏前完成主题与常用语法挂载，File 与 FileDiff 首次渲染即可同步出正文。 */
export function prepareCodeView(): Promise<void> {
  preparing ??= preloadHighlighter({
    themes: [codeViewOptions.theme.light, codeViewOptions.theme.dark],
    langs: preloadedLanguages,
  }).catch(error => { preparing = null; throw error; });
  return preparing;
}
