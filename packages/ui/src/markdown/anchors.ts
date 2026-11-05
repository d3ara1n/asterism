interface MarkdownNode {
  type: string;
  properties?: Record<string, unknown>;
  children?: MarkdownNode[];
}

/** A conversation can contain many documents with the same footnote labels. */
export function scopeMarkdownAnchors(tree: MarkdownNode, prefix: string): void {
  const properties = tree.properties;
  if (properties) {
    if (typeof properties.id === "string") properties.id = prefix + properties.id;
    if (typeof properties.href === "string" && properties.href.startsWith("#")) properties.href = "#" + prefix + properties.href.slice(1);
    if (Array.isArray(properties.ariaDescribedBy)) properties.ariaDescribedBy = properties.ariaDescribedBy.map(id => prefix + id);
  }
  for (const child of tree.children ?? []) scopeMarkdownAnchors(child, prefix);
}

export function rehypeScopedAnchors({ prefix }: { prefix: string }) {
  return (tree: MarkdownNode) => scopeMarkdownAnchors(tree, prefix);
}
