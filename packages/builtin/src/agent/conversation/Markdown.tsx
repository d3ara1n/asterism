import { CachedMarkdown, Streamdown, type StreamdownProps } from "@lobehub/streamdown";
import { useI18n } from "@asterism/sdk/renderer";
import { useReducedMotion } from "motion/react";
import { memo, useEffect, useState } from "react";

import { externalWebUrl } from "@asterism/ui/links";
import { markdownMessages } from "../../messages/markdown";
import { MarkdownCode, MarkdownStreamingContext } from "./MarkdownCode";
import { markdownOptions } from "./markdown-options";

const components: NonNullable<StreamdownProps["components"]> = {
  a: ({ href, children }) => {
    const url = href ? externalWebUrl(href) : null;
    return url ? <a href={url} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
  },
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
  table: ({ children }) => <div className="content-scrollbar my-4 overflow-x-auto"><table>{children}</table></div>,
};

/** Drain window for smoothed output after streaming ends (the balanced preset has an upper bound of about 880ms), after which rendering returns to static mode. */
const streamSettleMs = 1000;

/**
 * The library handles parsing, completion, and fade-in; historical content is displayed statically.
 * Streamdown has no end signal and retains word-by-word animation while the trailing block is mounted, so mount it only during generation and the drain window.
 */
export const Markdown = memo(function Markdown({ children, streaming = false }: { children: string; streaming?: boolean }) {
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
  return <MarkdownStreamingContext value={streaming}>
    <div className="markdown-content type-body min-w-0 break-words [overflow-wrap:anywhere]">
      {live && !reducedMotion
        ? <Streamdown {...markdownOptions} components={components} content={children} latexGuard smoothing="balanced" granularity="word" remend={{ htmlTags: false }} />
        : <CachedMarkdown {...markdownOptions} components={components}>{children}</CachedMarkdown>}
    </div>
  </MarkdownStreamingContext>;
});

function MarkdownImage({ src, alt, title }: { src: string; alt: string; title?: string }) {
  const i18n = useI18n();
  const [failed, setFailed] = useState(false);
  return <a href={src} target="_blank" rel="noopener noreferrer" aria-label={alt || i18n.text(markdownMessages.markdownImage)}>
    {failed
      ? <span>{i18n.text(markdownMessages.markdownImageFailed)}{alt ? ` · ${alt}` : ""}</span>
      : <img src={src} alt={alt} title={title} loading="lazy" decoding="async" referrerPolicy="no-referrer"
        className="my-2 block h-auto max-w-full rounded-md" onError={() => setFailed(true)} />}
  </a>;
}
