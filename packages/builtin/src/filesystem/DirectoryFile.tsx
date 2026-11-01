import { lazy, Suspense, useEffect, useState } from "react";
import { IslandPanel, useI18n, useRendererCalls } from "@asterism-app/sdk/renderer";
import type { ResourceRef, UiText } from "@asterism-app/sdk/contracts";
import type { z } from "zod";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Button } from "@asterism-app/ui/ui/button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { failureDisplay } from "@asterism-app/ui/error-display";
import { ReadDirectoryFile } from "./editor-contract";
import { editorMessages as messages } from "../messages/editor";

const FileEditor = lazy(() => import("./FileEditor"));
const ImageViewer = lazy(() => import("./ImageViewer"));

/** File dispatch belongs to the directory plugin; the host opens arbitrary content without interpreting formats. */
export default function DirectoryFile({ resource, path }: { resource: ResourceRef; path: string }) {
  const i18n = useI18n();
  const calls = useRendererCalls();
  const { sessionId, id, kind } = resource;
  const [file, setFile] = useState<z.infer<typeof ReadDirectoryFile.output> | null>(null);
  const [error, setError] = useState<UiText | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void calls.invoke(ReadDirectoryFile, { path }, { object: { sessionId, id, kind }, signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setFile(value); })
      .catch(failure => { if (!controller.signal.aborted) setError(failureDisplay(failure, messages.readFailed)); });
    return () => controller.abort();
  }, [calls, sessionId, id, kind, path, attempt]);
  const loading = <IslandPanel title={path}><p className="type-caption flex items-center gap-2" role="status">
    <Spinner />{i18n.text(commonMessages.loading)}
  </p></IslandPanel>;
  if (file) return <Suspense fallback={loading}>{file.kind === "image"
    ? <ImageViewer path={path} mediaType={file.mediaType} base64={file.base64} />
    : <FileEditor resource={resource} path={path} text={file.text} />}</Suspense>;
  return error ? <IslandPanel title={path}>
    <Alert variant="destructive"><AlertDescription>{i18n.text(error)}
      <Button variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>{i18n.text(commonMessages.retry)}</Button>
    </AlertDescription></Alert>
  </IslandPanel> : loading;
}
