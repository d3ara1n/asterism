import { useI18n } from "@atelier/sdk/renderer";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { MermaidConfig } from "mermaid";
import { Alert, AlertDescription } from "@atelier/ui/ui/alert";
import { StatusText } from "@atelier/ui/ui/status";
import { markdownMessages } from "../../messages/markdown";
import { useMermaidTheme } from "./mermaid-theme";

type RenderedDiagram = { code: string; theme: MermaidConfig } & ({ svg: string; error?: never } | { error: true; svg?: never });

/** 已渲染的图按主题与源码缓存；条目随滚动重新挂载时直接显示，不重新渲染。 */
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

/** 使用 Mermaid 官方 render/strict 清理输出；异步结果只交给仍匹配的组件实例。 */
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

  // 外观切换时保留上一张图，待新主题就绪后替换，避免闪回源码。
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
