import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import { chmod, open, rename, rm, stat, type FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileSaveChannel, fileSaveCommandSchema, type FileSaveReply } from "../shared/file-save.ts";

interface Saving { file: FileHandle; path: string; temporary: string; tail: Promise<unknown>; mode?: number }
/** Native Save As owns the chosen destination; streamed chunks never expose a reusable arbitrary-write path. */
export function serveFileSaves(window: BrowserWindow, trusted: (event: IpcMainInvokeEvent) => boolean): () => void {
  const active = new Map<string, Saving>();
  const discard = async (entry: Saving) => {
    await entry.tail.catch(() => {});
    await entry.file.close();
    await rm(entry.temporary, { force: true });
  };
  const reset = () => {
    const entries = [...active.values()]; active.clear();
    void Promise.all(entries.map(discard)).catch(error => console.error("File save cleanup failed.", error));
  };
  ipcMain.handle(fileSaveChannel, async (event, raw): Promise<FileSaveReply> => {
    if (!trusted(event)) throw new Error("Untrusted application frame.");
    const command = fileSaveCommandSchema.parse(raw);
    if (command.type === "begin") {
      const filename = command.filename.split(/[\\/]/).at(-1) || "file";
      const result = await dialog.showSaveDialog(window, { defaultPath: filename, properties: ["createDirectory", "showOverwriteConfirmation"] });
      if (result.canceled || !result.filePath) return { kind: "opened", id: null };
      const path = result.filePath, id = randomUUID(), temporary = join(dirname(path), `.asterism-${id}.tmp`);
      const previous = await stat(path).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      const file = await open(temporary, "wx");
      active.set(id, { path, temporary, file, tail: Promise.resolve(), ...(previous ? { mode: previous.mode & 0o777 } : {}) });
      return { kind: "opened", id };
    }
    const entry = active.get(command.id);
    if (!entry) {
      if (command.type === "abort") return { kind: "done" };
      throw new Error("The file save is no longer active.");
    }
    if (command.type === "write") {
      const work = entry.tail.then(() => entry.file.writeFile(command.data));
      entry.tail = work;
      await work;
      return { kind: "done" };
    }
    active.delete(command.id);
    if (command.type === "abort") { await discard(entry); return { kind: "done" }; }
    try {
      await entry.tail;
      await entry.file.sync();
      await entry.file.close();
      if (entry.mode !== undefined) await chmod(entry.temporary, entry.mode);
      await rename(entry.temporary, entry.path);
    } catch (error) { await discard(entry); throw error; }
    return { kind: "done" };
  });
  window.webContents.on("did-navigate", reset);
  window.webContents.on("render-process-gone", reset);
  return () => {
    ipcMain.removeHandler(fileSaveChannel);
    window.webContents.removeListener("did-navigate", reset);
    window.webContents.removeListener("render-process-gone", reset);
    reset();
  };
}
