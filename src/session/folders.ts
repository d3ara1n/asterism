import type { DatabaseSync } from "node:sqlite";
import type { Folder, FolderColor } from "../shared/folders.ts";
import { folderMessages } from "../shared/folder-messages.ts";
import { SessionError } from "../shared/session-timeline.ts";

/** Membership targets must name an existing folder; null places the row outside every folder. */
export function requireFolder(db: DatabaseSync, folderId: string | null): void {
  if (folderId !== null && !db.prepare("SELECT 1 FROM folders WHERE id = ?").get(folderId))
    throw new SessionError("not_found", "Folder not found.", folderMessages.notFound);
}

/** Folder catalog and membership writes. Folders hold no session content; deletion releases members through the foreign key. */
export class FolderStore {
  constructor(private readonly db: DatabaseSync) {}
  list(): Folder[] {
    return this.db.prepare("SELECT id, name, color, created_at AS createdAt FROM folders ORDER BY created_at, rowid").all() as unknown as Folder[];
  }
  /** Active session membership; archived sessions keep their column but leave the catalog. */
  sessionFolders(): Map<string, string | null> {
    const rows = this.db.prepare("SELECT id, folder_id FROM sessions WHERE archived_at IS NULL").all() as { id: string; folder_id: string | null }[];
    return new Map(rows.map(row => [row.id, row.folder_id]));
  }
  create(id: string, name: string, color: FolderColor): void {
    if (this.db.prepare("SELECT 1 FROM folders WHERE id = ?").get(id)) return;
    this.db.prepare("INSERT INTO folders (id, name, color, created_at) VALUES (?, ?, ?, ?)").run(id, name, color, new Date().toISOString());
  }
  update(id: string, name: string, color: FolderColor): void {
    if (!this.db.prepare("UPDATE folders SET name = ?, color = ? WHERE id = ?").run(name, color, id).changes)
      throw new SessionError("not_found", "Folder not found.", folderMessages.notFound);
  }
  delete(id: string): void {
    this.db.prepare("DELETE FROM folders WHERE id = ?").run(id);
  }
  moveSession(sessionId: string, folderId: string | null): void {
    requireFolder(this.db, folderId);
    if (!this.db.prepare("UPDATE sessions SET folder_id = ? WHERE id = ? AND archived_at IS NULL").run(folderId, sessionId).changes)
      throw new SessionError("not_found", "Session not found.");
  }
  moveTemplate(templateId: string, folderId: string | null): void {
    requireFolder(this.db, folderId);
    if (!this.db.prepare("UPDATE templates SET folder_id = ? WHERE id = ?").run(folderId, templateId).changes)
      throw new SessionError("not_found", "Template not found.");
  }
}
