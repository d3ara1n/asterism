import { lazy } from "react";
import type { ResourceRef } from "@asterism-app/sdk/contracts";
import { ReadDirectoryFile } from "./editor-contract";
import { FileView } from "./FileView";

const FileEditor = lazy(() => import("./FileEditor"));

export default function DirectoryFile({ resource, path }: { resource: ResourceRef; path: string }) {
  return <FileView resource={resource} path={path} readFile={ReadDirectoryFile} TextView={FileEditor} />;
}
