import { CachedMarkdown, Streamdown, type StreamdownProps } from "@lobehub/streamdown";
import { useI18n } from "@asterism-app/sdk/renderer";
import { useReducedMotion } from "./reduced-motion";
import { memo, useContext, useEffect, useId, useMemo, useState } from "react";

import { TooltipHint } from "../tooltip-hint";
import { externalWebUrl } from "../links";
import { markdownMessages } from "../messages/markdown";
import { MarkdownCode } from "./code";
import { MarkdownLink } from "./link";
import { markdownOptions } from "./options";
import { rehypeScopedAnchors } from "./anchors";
import { MarkdownDocumentContext, MarkdownStreamingContext } from "./presentation";

const components: NonNullable<StreamdownProps["components"]> = {
  a: ({ node: _node, ...props }) => <MarkdownLink {...props} />,
  img: ({ src, alt, title }) => {
    const url = typeof src === "string" ? externalWebUrl(src) : null;
    return url ? <MarkdownImage key={url} src={url} alt={alt ?? ""} title={title} /> : <span>{alt}</span>;
  },
  pre: ({ node, children }) => {
    const code = node?.children.find(child => child.type === "element" && child.tagName === "code");
    if (!code || code.type !== "element") return <pre>{children}</pre>;
    const classes = code.properties.className;
    const languageClass = Array.isArray(classes) ? classes.find(value => typeof value === "string" && value.startsWith("language-")) : undefined;
    const language = typeof languageClass === "string" ? languageClass.slice("language-".length) : "";
    const text = code.children.map(child => child.type === "text" ? child.value : "").join("");
    return <MarkdownCode code={text} language={language} />;
  },
  table: ({ children }) => <div className="surface-tint my-4 overflow-x-auto rounded-lg"><table>{children}</table></div>,
};

/** Drain window for smoothed output after streaming ends (the balanced preset has an upper bound of about 880ms), after which rendering returns to static mode. */
const streamSettleMs = 1000;

/**
 * Shared Markdown for every plugin; typography and KaTeX styles come from the host stylesheet (`.markdown-content`).
 * The library handles parsing, completion, and fade-in; historical content is displayed statically.
 * Document presentation keeps the same parser and components, with wrapped code and non-navigating internal references.
 * Streamdown has no end signal and retains word-by-word animation while the trailing block is mounted, so mount it only during generation and the drain window.
 */
export const Markdown = memo(function Markdown({ children, streaming = false, document = false }: { children: string; streaming?: boolean; document?: boolean }) {
  const id = useId();
  const i18n = useI18n();
  const options = useMemo(() => ({ ...markdownOptions,
    remarkRehypeOptions: { footnoteLabel: i18n.text(markdownMessages.markdownFootnotes),
      footnoteBackLabel: i18n.text(markdownMessages.markdownFootnoteBack) },
    rehypePlugins: [...markdownOptions.rehypePlugins, [rehypeScopedAnchors, { prefix: `markdown-${id}-` }]],
  } satisfies Omit<StreamdownProps, "content">), [id, i18n]);
  // After the live block is persisted, the same renderer finishes draining smoothed output so switching to static rendering does not abruptly reveal the undisplayed tail.
  const [settling, setSettling] = useState(streaming);
  useEffect(() => {
    if (streaming) { setSettling(true); return; }
    if (!settling) return;
    const timer = window.setTimeout(() => setSettling(false), streamSettleMs);
    return () => window.clearTimeout(timer);
  }, [streaming, settling]);
  const live = streaming || settling;
  const reducedMotion = useReducedMotion();
  return <MarkdownDocumentContext value={document}><MarkdownStreamingContext value={streaming}>
    <div data-markdown-root className="markdown-content type-body min-w-0 break-words [overflow-wrap:anywhere]">
      {live && !reducedMotion
        ? <Streamdown {...options} components={components} content={children} smoothing="balanced" granularity="word" remend={{ htmlTags: false }} />
        : <CachedMarkdown {...options} components={components}>{children}</CachedMarkdown>}
    </div>
  </MarkdownStreamingContext></MarkdownDocumentContext>;
});

function MarkdownImage({ src, alt, title }: { src: string; alt: string; title?: string }) {
  const i18n = useI18n();
  const [failed, setFailed] = useState(false);
  const documentMode = useContext(MarkdownDocumentContext);
  return <TooltipHint content={title}><a href={src} target="_blank" rel="noopener noreferrer" aria-label={alt || i18n.text(markdownMessages.markdownImage)}>
    {failed
      ? <span>{i18n.text(markdownMessages.markdownImageFailed)}{alt ? ` · ${alt}` : ""}</span>
      : <img src={src} alt={alt} loading={documentMode ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer"
        className="my-2 block h-auto max-w-full rounded-md" onError={() => setFailed(true)} />}
  </a></TooltipHint>;
}
