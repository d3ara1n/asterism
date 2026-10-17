import { useI18n } from "@atelier/sdk/renderer";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Alert, AlertDescription } from "@atelier/ui/ui/alert";
import { StatusText } from "@atelier/ui/ui/status";
import { markdownMessages } from "../../messages/markdown";

const darkQuery = "(prefers-color-scheme: dark)";
function subscribeScheme(changed: () => void) {
  const media = window.matchMedia(darkQuery);
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
}
const darkSnapshot = () => window.matchMedia(darkQuery).matches;
const serverSnapshot = () => false;

type RenderedDiagram = { code: string; dark: boolean } & ({ svg: string; error?: never } | { error: true; svg?: never });

/** 使用 Mermaid 官方 render/strict 清理输出；异步结果只交给仍匹配的组件实例。 */
export function MermaidDiagram({ code, streaming, children }: { code: string; streaming: boolean; children: ReactNode }) {
  const i18n = useI18n();
  const dark = useSyncExternalStore(subscribeScheme, darkSnapshot, serverSnapshot);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const sequence = useRef(0);
  const [rendered, setRendered] = useState<RenderedDiagram | null>(null);
  useEffect(() => {
    if (streaming || !code.trim()) return;
    let active = true;
    const renderId = `mermaid-${id}-${++sequence.current}`;
    void (async () => {
      const { default: mermaid } = await import("mermaid");
      if (!active) return;
      mermaid.initialize({
        startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true,
        htmlLabels: false, theme: dark ? "dark" : "default",
        fontFamily: getComputedStyle(document.documentElement).fontFamily,
      });
      const { svg } = await mermaid.render(renderId, code);
      if (active) setRendered({ code, dark, svg });
    })().catch(error => {
      if (!active) return;
      console.warn("Mermaid diagram could not be rendered.", error);
      setRendered({ code, dark, error: true });
    });
    return () => { active = false; };
  }, [code, streaming, dark, id]);

  if (streaming || !code.trim()) return children;
  const current = rendered?.code === code && rendered.dark === dark ? rendered : null;
  if (current?.svg) return <div className="overflow-x-auto p-3" role="img" aria-label={i18n.text(markdownMessages.markdownDiagram)}
    dangerouslySetInnerHTML={{ __html: current.svg }} />;
  return <>
    <div className="p-3">
      {current?.error
        ? <Alert variant="destructive"><AlertDescription>{i18n.text(markdownMessages.markdownDiagramFailed)}</AlertDescription></Alert>
        : <StatusText tone="progress">{i18n.text(markdownMessages.markdownDiagramRendering)}</StatusText>}
    </div>
    {children}
  </>;
}
