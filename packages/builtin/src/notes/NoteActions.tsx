import { lazy, Suspense, useRef, useState } from "react";
import { IslandPanel, useI18n, useRendererCalls, useRendererIsland, useRendererObject } from "@asterism-app/sdk/renderer";
import { Copy, FilePenLine } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { failureDisplay } from "@asterism-app/ui/error-display";
import { textMessages } from "../messages/text";
import { ReadNoteText } from "./contract";

const NoteEditor = lazy(() => import("./NoteEditor"));

export function NoteActions({ data }: { data: { text: string | null } }) {
  const i18n = useI18n();
  const { ref: resource } = useRendererObject();
  const calls = useRendererCalls();
  const island = useRendererIsland();
  const [copying, setCopying] = useState(false);
  const [opening, setOpening] = useState(false);
  const pending = useRef(false);
  const edit = async (origin: HTMLElement) => {
    if (pending.current) return;
    pending.current = true;
    setOpening(true);
    try {
      const { title, text } = await calls.invoke(ReadNoteText, {}, { object: resource });
      // Reopening the same note starts a fresh buffer after the island's close guards accept.
      const editorKey = crypto.randomUUID();
      await island.open({
        key: `note:${resource.sessionId}:${resource.id}`, label: title, size: "content", origin,
        render: () => <Suspense fallback={<IslandPanel title={title}><Spinner /></IslandPanel>}>
          <NoteEditor key={editorKey} resource={resource} title={title} text={text} />
        </Suspense>,
      });
    } catch (error) {
      console.error("Note editor could not be opened.", error);
      toast.error(i18n.text(failureDisplay(error, textMessages.noteOpenFailed)));
    } finally {
      pending.current = false;
      setOpening(false);
    }
  };
  const copy = async () => {
    if (data.text === null || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(data.text);
      toast.success(i18n.text(textMessages.noteCopied));
    } catch (error) {
      console.error("Note could not be copied.", error);
      toast.error(i18n.text(textMessages.noteCopyFailed));
    } finally {
      setCopying(false);
    }
  };
  return <>
    <IconButton size="icon-xs" label={i18n.text(textMessages.editNote)}
      disabled={data.text === null || opening} onClick={event => { void edit(event.currentTarget); }}>
      {opening ? <Spinner /> : <FilePenLine />}
    </IconButton>
    <IconButton size="icon-xs" label={i18n.text(textMessages.copyNoteMarkdown)}
      disabled={data.text === null || copying} onClick={() => { void copy(); }}>
      <Copy />
    </IconButton>
  </>;
}
