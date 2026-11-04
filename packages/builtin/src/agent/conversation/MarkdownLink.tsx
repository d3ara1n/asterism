import { useState, type ComponentProps } from "react";
import { parseResourceLink, type ResourceLink } from "@asterism-app/sdk/contracts";
import { useRendererObject, useRendererResourceNavigation } from "@asterism-app/sdk/renderer";
import { externalWebUrl } from "@asterism-app/ui/links";

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
  const resource = href ? parseResourceLink(href) : null;
  if (resource) return <ResourceLocationLink {...props} href={href} destination={resource}>{children}</ResourceLocationLink>;
  const url = href ? externalWebUrl(href) : null;
  return url ? <a {...props} href={url} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
}

function ResourceLocationLink({ destination, children, ...props }: AnchorProps & { destination: ResourceLink }) {
  const object = useRendererObject();
  const navigation = useRendererResourceNavigation();
  const [pending, setPending] = useState(false);
  return <a {...props} aria-disabled={pending || undefined} onAuxClick={event => event.preventDefault()} onClick={event => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    void navigation.open({ sessionId: object.ref.sessionId, id: destination.resourceId }, destination.location, { origin: event.currentTarget })
      .finally(() => setPending(false));
  }}>{children}</a>;
}
