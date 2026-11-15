import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { IslandPanel, useI18n, useRendererCalls } from "@asterism-app/sdk/renderer";
import type { ResourceRef, UiText } from "@asterism-app/sdk/contracts";
import type { z } from "zod";
import { File, Folder } from "lucide-react";
import { ResourceLocationActions } from "@asterism-app/ui/resource-location-actions";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@asterism-app/ui/ui/empty";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Button } from "@asterism-app/ui/ui/button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { failureDisplay } from "@asterism-app/ui/error-display";
import { ResourceSourceChip } from "@asterism-app/ui/reference-chip";
import type { ReadDirectoryFile } from "./editor-contract";
import { editorMessages as messages } from "../messages/editor";

const ImageViewer = lazy(() => import("./ImageViewer"));

/** Resources supply their read contract, text surface, and location actions; preview availability does not determine external opening. */
export function FileView({ resource, path, readFile, TextView }: {
  resource: ResourceRef;
  path: string;
  readFile: typeof ReadDirectoryFile;
  TextView: ComponentType<{ resource: ResourceRef; path: string; text: string; source: ReactNode; actions?: ReactNode }>;
}) {
  const i18n = useI18n();
  const calls = useRendererCalls();
  const { sessionId, id, kind } = resource;
  const [file, setFile] = useState<z.infer<typeof ReadDirectoryFile.output> | null>(null);
  const [error, setError] = useState<UiText | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null); setFile(null);
    void calls.invoke(readFile, { path }, { object: { sessionId, id, kind }, signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setFile(value); })
      .catch(failure => { if (!controller.signal.aborted) setError(failureDisplay(failure, messages.readFailed)); });
    return () => controller.abort();
  }, [calls, readFile, sessionId, id, kind, path, attempt]);
  const source = <ResourceSourceChip resource={resource} />;
  const actions = <ResourceLocationActions resource={resource} location={path} />;
  const loading = <IslandPanel title={path} source={source} action={actions}><p className="type-caption flex items-center gap-2" role="status">
    <Spinner />{i18n.text(commonMessages.loading)}
  </p></IslandPanel>;
  if (file?.kind === "unsupported" || file?.kind === "directory") return <IslandPanel title={path} source={source} action={actions} layout="fill">
    <Empty><EmptyHeader>
      <EmptyMedia variant="icon">{file.kind === "directory" ? <Folder /> : <File />}</EmptyMedia>
      <EmptyTitle>{i18n.text(file.kind === "directory" ? messages.folder : messages.previewUnavailable)}</EmptyTitle>
      {file.kind === "unsupported" && <EmptyDescription>
        {i18n.formatNumber(file.size, { style: "unit", unit: "byte", notation: "compact", maximumFractionDigits: 1 })}
        {file.reason === "size" && <> · {i18n.text(messages.tooLarge)}</>}
      </EmptyDescription>}
    </EmptyHeader></Empty>
  </IslandPanel>;
  if (file) return <Suspense fallback={loading}>{file.kind === "image"
    ? <ImageViewer path={path} mediaType={file.mediaType} base64={file.base64} source={source} actions={actions} />
    : <TextView resource={resource} path={path} text={file.text} source={source} actions={actions} />}</Suspense>;
  return error ? <IslandPanel title={path} source={source} action={actions}>
    <Alert variant="destructive"><AlertDescription>{i18n.text(error)}
      <Button variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>{i18n.text(commonMessages.retry)}</Button>
    </AlertDescription></Alert>
  </IslandPanel> : loading;
}
