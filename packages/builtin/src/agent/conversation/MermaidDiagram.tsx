import { useI18n } from "@asterism-app/sdk/renderer";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { MermaidConfig } from "mermaid";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { StatusText } from "@asterism-app/ui/ui/status";
import { markdownMessages } from "../../messages/markdown";
import { useMermaidTheme } from "./mermaid-theme";

type RenderedDiagram = { code: string; theme: MermaidConfig } & ({ svg: string; error?: never } | { error: true; svg?: never });

/** Rendered diagrams are cached by theme and source; items remounted during scrolling display directly without rerendering the diagram. */
const renderedDiagrams = new Map<string, RenderedDiagram>();
const renderedDiagramLimit = 64;
const diagramKey = (code: string, theme: MermaidConfig) => `${JSON.stringify(theme)}\n${code}`;
function remember(diagram: RenderedDiagram): RenderedDiagram {
  const key = diagramKey(diagram.code, diagram.theme);
  renderedDiagrams.delete(key);
  renderedDiagrams.set(key, diagram);
  if (renderedDiagrams.size > renderedDiagramLimit) renderedDiagrams.delete(renderedDiagrams.keys().next().value!);
  return diagram;
}

/** Uses Mermaid's official render/strict sanitization; asynchronous results are delivered only to the component instance that still matches. */
export function MermaidDiagram({ code, streaming, children }: { code: string; streaming: boolean; children: ReactNode }) {
  const i18n = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const theme = useMermaidTheme(container);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const sequence = useRef(0);
  const [rendered, setRendered] = useState<RenderedDiagram | null>(null);
  useEffect(() => {
    if (streaming || !code.trim() || !theme) return;
    const cached = renderedDiagrams.get(diagramKey(code, theme));
    if (cached?.svg) { setRendered(cached); return; }
    let active = true;
    const renderId = `mermaid-${id}-${++sequence.current}`;
    void (async () => {
      const { default: mermaid } = await import("mermaid");
      if (!active) return;
      mermaid.initialize({
        ...theme,
        startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true,
        htmlLabels: false,
      });
      const { svg } = await mermaid.render(renderId, code);
      const diagram = remember({ code, theme, svg });
      if (active) setRendered(diagram);
    })().catch(error => {
      if (!active) return;
      console.warn("Mermaid diagram could not be rendered.", error);
      setRendered({ code, theme, error: true });
    });
    return () => { active = false; };
  }, [code, streaming, theme, id]);

  // Keep the previous diagram during an appearance change and replace it when the new theme is ready, avoiding a flash back to source code.
  const cached = theme ? renderedDiagrams.get(diagramKey(code, theme)) : undefined;
  const current = cached?.svg ? cached : rendered?.code === code ? rendered : null;
  let content = children;
  if (!streaming && code.trim() && theme) {
    content = current?.svg
      ? <div className="overflow-x-auto bg-card p-3" role="img" aria-label={i18n.text(markdownMessages.markdownDiagram)}
        dangerouslySetInnerHTML={{ __html: current.svg }} />
      : <>
        <div className="p-3">
          {current?.error && current.theme === theme
            ? <Alert variant="destructive"><AlertDescription>{i18n.text(markdownMessages.markdownDiagramFailed)}</AlertDescription></Alert>
            : <StatusText tone="progress">{i18n.text(markdownMessages.markdownDiagramRendering)}</StatusText>}
        </div>
        {children}
      </>;
  }
  return <div ref={container}>{content}</div>;
}
