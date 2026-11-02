import { createContext, useContext } from "react";
import type { z } from "zod";
import type { UiText } from "@asterism-app/sdk/contracts";
import type { Folder, folderCommands } from "../../../shared/folders";

export type FolderCommand = z.infer<(typeof folderCommands)[number]>;

/** Folder catalog and membership writes shared by navigation, Home, and templates. */
export interface FolderServices {
  folders: readonly Folder[];
  /** Applies the refreshed snapshot on success; returns the failure display otherwise. */
  run(command: FolderCommand): Promise<UiText | null>;
  ready: boolean;
}
const Folders = createContext<FolderServices | null>(null);
export const FolderServicesProvider = Folders.Provider;
export function useFolders(): FolderServices {
  const value = useContext(Folders);
  if (!value) throw new Error("Folder services must be provided by the application.");
  return value;
}
/** A folder reference whose folder was deleted reads as no folder. */
export function existingFolder(folders: readonly Folder[], id: string | null): Folder | null {
  return id === null ? null : folders.find(folder => folder.id === id) ?? null;
}
