/** Replaced when a document is served, not fixed into the distributed HTML. */
export const rendererNoncePlaceholder = "__ASTERISM_IMPORTMAP_NONCE__";
export function rendererDocument(html: string, nonce: string): string {
  return html.replaceAll(rendererNoncePlaceholder, nonce);
}
