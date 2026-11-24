import { lazy } from "react";
import type { ResourceRef } from "@asterism-app/sdk/contracts";
import type { TextEditorNavigation } from "../editor/navigation";
import { ReadDirectoryFile } from "./editor-contract";
import { FileView } from "./FileView";

const FileEditor = lazy(() => import("./FileEditor"));

export default function DirectoryFile({ resource, path, navigation }: {
  resource: ResourceRef; path: string; navigation?: TextEditorNavigation;
}) {
  return <FileView resource={resource} path={path || "."} readFile={ReadDirectoryFile} TextView={FileEditor} navigation={navigation} />;
}
