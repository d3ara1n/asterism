import type { JSONContent } from "@tiptap/core";
import { parseResourceLink, parseSkillLink } from "@asterism-app/sdk/contracts";

/** Tiptap node type of a composer reference chip. */
export const referenceNodeName = "referenceChip";

/** Markdown link whose destination uses an app-defined reference scheme. */
const referencePattern = /\[([^\]\r\n]*)\]\(((?:resource|skill):[^()\s]+)\)/gu;

/** What a reference addresses, for chip presentation; null for destinations outside the reference schemes. */
export type ReferenceKind = "skill" | "directory" | "file";

export function referenceKind(href: string): ReferenceKind | null {
  if (parseSkillLink(href)) return "skill";
  const resource = parseResourceLink(href);
  if (!resource) return null;
  // A resource root or a trailing slash addresses a container; other locations address an item.
  return !resource.location || resource.location.endsWith("/") ? "directory" : "file";
}

/** Whether a destination addresses a resource location or a skill. */
export function isReferenceHref(href: string): boolean {
  return referenceKind(href) !== null;
}

/**
 * Whether the `@` trigger may open after the given preceding character. An empty string means line start.
 * Latin word characters block it so addresses like `name@example.com` stay plain; CJK text, spaces,
 * punctuation and chips (object replacement character) allow it.
 */
export function referenceTriggerAllowedAfter(previous: string): boolean {
  return !/[A-Za-z0-9_]/u.test(previous);
}

/** Composer document → submitted text: paragraphs and hard breaks become newlines, chips become markdown links. */
export function serializeDoc(doc: JSONContent | null | undefined): string {
  return (doc?.content ?? []).map(serializeInline).join("\n");
}

function serializeInline(node: JSONContent): string {
  switch (node.type) {
    case "text": return node.text ?? "";
    case "hardBreak": return "\n";
    case referenceNodeName: return `[${node.attrs?.label ?? ""}](${node.attrs?.href ?? ""})`;
    default: return (node.content ?? []).map(serializeInline).join("");
  }
}

/** Submitted text → composer document: each line is a paragraph, reference links become chips. */
export function parseComposerText(input: string): JSONContent {
  return { type: "doc", content: input.split("\n").map(parseLine) };
}

function parseLine(line: string): JSONContent {
  const content: JSONContent[] = [];
  let last = 0;
  const text = (value: string) => { if (value) content.push({ type: "text", text: value }); };
  for (const match of line.matchAll(referencePattern)) {
    const [source, label = "", href = ""] = match;
    if (!isReferenceHref(href)) continue;
    text(line.slice(last, match.index));
    content.push({ type: referenceNodeName, attrs: { label, href } });
    last = match.index + source.length;
  }
  text(line.slice(last));
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}
