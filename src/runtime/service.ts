import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { commandSchema, snapshotSchema, type AppSnapshot, type AppError } from "../shared/contracts.ts";
import type { SecretProtector } from "../shared/secrets.ts";
import type { SessionChanged } from "../shared/session.ts";
import type { ModelSettings } from "../shared/model.ts";
import type { ModelAdapter } from "../model/contract.ts";
import { ObjectStore, openDatabase } from "./storage.ts";
import { ConfigurationService } from "../configuration/service.ts";
import { SessionService } from "./sessions.ts";

export class ApplicationError extends Error {
  constructor(readonly code: AppError["code"], message: string) { super(message); }
}

/** 应用组合根与会话索引；会话内容、操作和查询由 SessionService 拥有。 */
export class ApplicationService {
  readonly configuration: ConfigurationService;
  readonly sessions: SessionService;
  private readonly db: DatabaseSync;
  constructor(root: string, options: { protector?: SecretProtector; onConfigurationChanged?: () => void; onSessionChanged?: (event: SessionChanged) => void; adapterFactory?: (settings: ModelSettings) => ModelAdapter } = {}) {
    this.db = openDatabase(root);
    try {
      const objects = new ObjectStore(join(root, "objects"));
      const unavailable = async (): Promise<string> => { throw new Error("System credential protection is unavailable."); };
      this.configuration = new ConfigurationService(this.db, root, options.protector ?? { available: async () => false, encrypt: unavailable, decrypt: unavailable }, options.onConfigurationChanged);
      this.sessions = new SessionService(this.db, objects, this.configuration, options.onSessionChanged, options.adapterFactory);
    } catch (error) { this.db.close(); throw error; }
  }
  async close(): Promise<void> {
    this.configuration.close();
    await this.sessions.close();
    this.db.close();
  }
  execute(raw: unknown): AppSnapshot {
    if (!commandSchema.safeParse(raw).success) throw new ApplicationError("invalid_request", "Invalid application command.");
    const workspace = this.db.prepare("SELECT * FROM workspace LIMIT 1").get();
    const sessions = this.sessions.tree.list().map(session => ({ id: session.id, title: session.title, created_at: session.createdAt }));
    return snapshotSchema.parse({ workspace, sessions });
  }
}
