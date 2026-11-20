import { useContext, useState, type ComponentProps } from "react";
import { MarkdownDocumentContext, MarkdownStreamingContext } from "./presentation";
import { parseModelUrl, parseResourceUrl, parseSkillUrl } from "@asterism-app/sdk/contracts";
import { useRendererObject } from "@asterism-app/sdk/renderer";
import { externalWebUrl } from "../links";
import { TooltipHint } from "../tooltip-hint";
import { ReferenceChip } from "../reference-chip";

type AnchorProps = ComponentProps<"a">;

export function MarkdownLink({ href, children, title, ...props }: AnchorProps) {
  const documentMode = useContext(MarkdownDocumentContext);
  const streaming = useContext(MarkdownStreamingContext);
  if (documentMode && href && (parseModelUrl(href) || parseSkillUrl(href) || parseResourceUrl(href))) return <span>{children}</span>;
  if (href?.startsWith("#")) return <TooltipHint content={title}><a {...props} href={href} onAuxClick={event => event.preventDefault()} onClick={event => {
    event.preventDefault();
    const root = event.currentTarget.closest("[data-markdown-root]");
    const target = root?.querySelector<HTMLElement>(`#${CSS.escape(href.slice(1))}`);
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
  }}>{children}</a></TooltipHint>;
  if (href && parseModelUrl(href)) return <ReferenceChip appearance="link" href={href}>{children}</ReferenceChip>;
  if (href && parseSkillUrl(href)) return <ReferenceChip appearance="link" href={href} openable>{children}</ReferenceChip>;
  if (href && parseResourceUrl(href)) return <ResourceReference href={href}>{children}</ResourceReference>;
  const url = href ? externalWebUrl(href) : null;
  if (!url) return <span>{children}</span>;
  const hint = <>{title && title !== url && <>{title}{"\n"}</>}<bdi dir="ltr" translate="no">{url}</bdi></>;
  // Don't request an unfinished destination or make document export depend on a decorative image.
  const favicon = documentMode || streaming ? null : new URL("/favicon.ico", url).href;
  return <TooltipHint content={hint}><a {...props} href={url} target="_blank" rel="noopener noreferrer">
    {favicon ? <LinkFavicon key={favicon} src={favicon} /> : null}{children}
  </a></TooltipHint>;
}

function LinkFavicon({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : <img src={src} alt="" width={14} height={14} loading="lazy" decoding="async" referrerPolicy="no-referrer"
    className="me-1 inline-block size-3.5 align-[-0.125em]" onError={() => setFailed(true)} />;
}

/** Resource IDs are scoped to the session of the object rendering the message. */
function ResourceReference({ href, children }: { href: string; children: AnchorProps["children"] }) {
  const object = useRendererObject();
  return <ReferenceChip appearance="link" href={href} sessionId={object.ref.sessionId} openable>{children}</ReferenceChip>;
}
