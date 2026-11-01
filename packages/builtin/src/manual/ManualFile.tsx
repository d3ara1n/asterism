import { lazy } from "react";
import type { ResourceRef } from "@asterism-app/sdk/contracts";
import { FileView } from "../filesystem/FileView";
import { ReadManualFile } from "./contract";

const TextViewer = lazy(() => import("../editor/TextViewer"));

export default function ManualFile({ resource, path }: { resource: ResourceRef; path: string }) {
  return <FileView resource={resource} path={path} readFile={ReadManualFile} TextView={TextViewer} />;
}
