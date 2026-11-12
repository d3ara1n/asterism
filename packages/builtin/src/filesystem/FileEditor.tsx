import { useEffect, useState, type ReactNode } from "react";
import { useI18n, useRendererCalls } from "@asterism-app/sdk/renderer";
import type { ResourceRef } from "@asterism-app/sdk/contracts";
import { EditorIsland } from "../editor/EditorIsland";
import { parseEditorText, serializeEditorText } from "../editor/text-format";
import { editorMessages as messages } from "../messages/editor";
import { ReadDirectoryGitBase, SaveDirectoryText } from "./editor-contract";

/** Files retain their text format and refresh the Git baseline after saving. */
export default function FileEditor({ resource, path, text, source }: { resource: ResourceRef; path: string; text: string; source?: ReactNode }) {
  const i18n = useI18n();
  const calls = useRendererCalls();
  const [initial] = useState(() => parseEditorText(text));
  const [saved, setSaved] = useState(initial.content);
  const [gitBase, setGitBase] = useState<string | null>(null);
  const [gitFailed, setGitFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void calls.invoke(ReadDirectoryGitBase, { path }, { object: resource, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      setGitBase(result.text === null ? null : parseEditorText(result.text).content);
      setGitFailed(false);
    }).catch(failure => {
      if (controller.signal.aborted) return;
      console.error("Editor Git baseline could not be read.", failure);
      setGitBase(null); setGitFailed(true);
    });
    return () => controller.abort();
  }, [calls, resource, path, saved]);
  return <EditorIsland title={path} source={source} filename={path} text={initial.content} gitBase={gitBase}
    status={gitFailed ? i18n.text(messages.gitFailed) : null}
    format={<>UTF-8 · {initial.format.lineSeparator === "\r\n" ? "CRLF" : initial.format.lineSeparator === "\r" ? "CR" : "LF"}</>}
    onSave={async content => {
      await calls.invoke(SaveDirectoryText, { path, text: serializeEditorText(content, initial.format) }, { object: resource });
      setSaved(content);
    }} />;
}
