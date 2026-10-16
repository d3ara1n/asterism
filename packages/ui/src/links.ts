/** 模型文本只能打开标准网页；不把模型生成的 URL 当作本机操作入口。 */
export function externalWebUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
