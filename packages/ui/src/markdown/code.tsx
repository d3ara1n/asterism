import { useI18n } from "@asterism-app/sdk/renderer";
import { Copy, WrapText } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { toast } from "sonner";

import { IconButton } from "../ui/icon-button";
import { CodeText } from "../code-view";
import { commonMessages } from "../messages/common";
import { markdownMessages } from "../messages/markdown";
import { MermaidDiagram } from "./mermaid";

export const MarkdownStreamingContext = createContext(false);

/** The fenced code body and language come directly from the Markdown AST; highlighting is handled by the shared Pierre view. */
export function MarkdownCode({ code, language }: { code: string; language: string }) {
  const i18n = useI18n();
  const streaming = useContext(MarkdownStreamingContext);
  const [copying, setCopying] = useState(false);
  const [lineWrapping, setLineWrapping] = useState(false);
  const copy = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(code);
      toast.success(i18n.text(markdownMessages.markdownCopied));
    } catch (error) {
      console.error("Code could not be copied.", error);
      toast.error(i18n.text(markdownMessages.markdownCopyFailed));
    } finally { setCopying(false); }
  };
  const source = <CodeText contents={code} language={language} overflow={lineWrapping ? "wrap" : "scroll"} />;
  return <div className="my-4 overflow-hidden rounded-md border border-border bg-muted/40">
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1">
      <span className="min-w-0 truncate type-caption text-muted-foreground">{language || i18n.text(markdownMessages.markdownPlainText)}</span>
      <div className="flex shrink-0 items-center gap-1">
        <IconButton size="icon-xs" label={i18n.text(commonMessages.wordWrap)} aria-pressed={lineWrapping}
          variant={lineWrapping ? "selected" : "ghost"} onClick={() => setLineWrapping(value => !value)}><WrapText /></IconButton>
        <IconButton size="icon-xs" label={i18n.text(markdownMessages.markdownCopyCode)} disabled={copying} onClick={() => { void copy(); }}><Copy /></IconButton>
      </div>
    </div>
    {language.toLowerCase() === "mermaid"
      ? <MermaidDiagram code={code} streaming={streaming}>{source}</MermaidDiagram>
      : source}
  </div>;
}
