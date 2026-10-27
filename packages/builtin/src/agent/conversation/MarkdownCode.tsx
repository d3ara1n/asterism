import { useI18n } from "@asterism/sdk/renderer";
import { Copy } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { toast } from "sonner";

import { IconButton } from "@asterism/ui/ui/icon-button";
import { CodeText } from "../../code-view";
import { markdownMessages } from "../../messages/markdown";
import { MermaidDiagram } from "./MermaidDiagram";

export const MarkdownStreamingContext = createContext(false);

/** The fenced code body and language come directly from the Markdown AST; highlighting is handled by the shared Pierre view. */
export function MarkdownCode({ code, language }: { code: string; language: string }) {
  const i18n = useI18n();
  const streaming = useContext(MarkdownStreamingContext);
  const [copying, setCopying] = useState(false);
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
  const source = <CodeText contents={code} language={language} />;
  return <div className="my-4 overflow-hidden rounded-md border border-border bg-muted/40">
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1">
      <span className="min-w-0 truncate type-caption text-muted-foreground">{language || i18n.text(markdownMessages.markdownPlainText)}</span>
      <IconButton size="icon-xs" label={i18n.text(markdownMessages.markdownCopyCode)} disabled={copying} onClick={() => { void copy(); }}><Copy /></IconButton>
    </div>
    {language.toLowerCase() === "mermaid"
      ? <MermaidDiagram code={code} streaming={streaming}>{source}</MermaidDiagram>
      : source}
  </div>;
}
