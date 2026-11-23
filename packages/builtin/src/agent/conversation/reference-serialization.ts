import { referenceLinks, referenceMarkdown } from "@asterism-app/sdk/contracts";
import type { JSONContent } from "@tiptap/core";
import { referenceKind } from "@asterism-app/ui/references";

/** Tiptap node type of a composer reference chip. */
export const referenceNodeName = "referenceChip";

/** Whether a destination addresses a resource location, skill, or configured model. */
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
    case referenceNodeName: return referenceMarkdown(node.attrs?.label ?? "", node.attrs?.href ?? "");
    default: return (node.content ?? []).map(serializeInline).join("");
  }
}

/** Submitted text → composer document: each line is a paragraph, reference links become chips. */
export function parseComposerText(input: string): JSONContent {
  return { type: "doc", content: input.split("\n").map(line => {
    const content = parseLine(line);
    return content.length ? { type: "paragraph", content } : { type: "paragraph" };
  }) };
}

/** Text inserted at a position inside a paragraph, such as dropped references: lines become hard breaks. */
export function parseComposerInline(input: string): JSONContent[] {
  return input.split("\n").flatMap((line, index) => [...index ? [{ type: "hardBreak" }] : [], ...parseLine(line)]);
}

function parseLine(line: string): JSONContent[] {
  const content: JSONContent[] = [];
  let last = 0;
  const text = (value: string) => { if (value) content.push({ type: "text", text: value }); };
  for (const link of referenceLinks(line)) {
    if (!isReferenceHref(link.url)) continue;
    text(line.slice(last, link.index));
    content.push({ type: referenceNodeName, attrs: { label: link.label, href: link.url } });
    last = link.index + link.length;
  }
  text(line.slice(last));
  return content;
}
