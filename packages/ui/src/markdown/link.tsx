import type { ComponentProps } from "react";
import { parseModelUrl, parseResourceUrl, parseSkillUrl } from "@asterism-app/sdk/contracts";
import { useRendererObject } from "@asterism-app/sdk/renderer";
import { externalWebUrl } from "../links";
import { ReferenceChip } from "../reference-chip";

type AnchorProps = ComponentProps<"a">;

export function MarkdownLink({ href, children, ...props }: AnchorProps) {
  if (href?.startsWith("#")) return <a {...props} href={href} onAuxClick={event => event.preventDefault()} onClick={event => {
    event.preventDefault();
    const root = event.currentTarget.closest("[data-markdown-root]");
    const target = root?.querySelector<HTMLElement>(`#${CSS.escape(href.slice(1))}`);
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
  }}>{children}</a>;
  if (href && parseModelUrl(href)) return <ReferenceChip href={href}>{children}</ReferenceChip>;
  if (href && parseSkillUrl(href)) return <ReferenceChip href={href} openable>{children}</ReferenceChip>;
  if (href && parseResourceUrl(href)) return <ResourceReference href={href}>{children}</ResourceReference>;
  const url = href ? externalWebUrl(href) : null;
  return url ? <a {...props} href={url} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
}

/** Resource IDs are scoped to the session of the object rendering the message. */
function ResourceReference({ href, children }: { href: string; children: AnchorProps["children"] }) {
  const object = useRendererObject();
  return <ReferenceChip href={href} sessionId={object.ref.sessionId} openable>{children}</ReferenceChip>;
}
