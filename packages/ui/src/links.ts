/** Model text can open only standard web pages; model-generated URLs are not local operation entry points. */
export function externalWebUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
