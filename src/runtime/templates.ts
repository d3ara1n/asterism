import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { jsonSchema, type Json } from "@asterism/sdk/contracts";
import { SessionDataStore } from "../session/data.ts";
import { SessionError, type SessionTree } from "../session/tree.ts";
import { templateDataSchema, type TemplateSummary, type TemplateData } from "../shared/templates.ts";
import { templateMessages } from "../shared/template-messages.ts";
import type { SessionWorkbench } from "./workbench.ts";
import type { ContentStore } from "./content-store.ts";
import type { ResourceRegistry } from "../resources/registry.ts";
import { createResourceId } from "../resources/id.ts";

export const templateSchemaSql = `
  CREATE TABLE templates (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, data_json TEXT NOT NULL
  ) STRICT;
`;

/** Templates save independent data; catalog reads and saves do not construct resource instances. Callers supply write transactions. */
export class TemplateStore {
  private readonly data: SessionDataStore;
  constructor(private readonly db: DatabaseSync, private readonly tree: SessionTree,
    private readonly workbench: SessionWorkbench, private readonly content: ContentStore,
    private readonly resources: ResourceRegistry) {
    this.data = new SessionDataStore(db);
  }
  list(): TemplateSummary[] {
    const rows = this.db.prepare(`SELECT id, title, created_at AS createdAt,
      (SELECT json_group_array(json_object('id', json_extract(value, '$.id'),
        'kind', json_extract(value, '$.kind'), 'title', json_extract(value, '$.title')))
        FROM json_each(templates.data_json, '$.objects')) AS objects
      FROM templates ORDER BY created_at DESC, rowid DESC`).all() as
      { id: string; title: string; createdAt: string; objects: string }[];
    return rows.map(row => ({ ...row, objects: JSON.parse(row.objects) }));
  }
  source(sessionId: string) {
    return this.tree.workbench(sessionId).objects.map(({ id, kind, title }) => ({ id, kind, title }));
  }
  save(sessionId: string, title: string, objectIds: readonly string[]): string {
    const state = this.tree.workbench(sessionId);
    const selected = new Set(objectIds);
    const objects = state.objects.filter(object => selected.has(object.id));
    if (objects.length !== selected.size)
      throw new SessionError("not_found", "A selected template object is no longer present.", templateMessages.sourceChanged);
    const value: TemplateData = {
      objects: objects.map(object => {
        const { id: _id, type: _type, title: _title, ...data } = object.data;
        return { id: object.id, kind: object.kind, title: object.title,
          data: jsonSchema.parse(data) as Record<string, Json>,
          current: this.data.entries(sessionId, object.id) };
      }),
      links: state.links.filter(link => selected.has(link.receiverId) && selected.has(link.resourceId)),
      views: this.workbench.layout(sessionId).views.filter(view => selected.has(view.objectId)),
    };
    const id = randomUUID();
    this.db.prepare("INSERT INTO templates VALUES (?, ?, ?, ?)").run(id, title, new Date().toISOString(), JSON.stringify(value));
    const recordIds = new Set(this.tree.view(sessionId).timelineIds());
    for (const object of value.objects)
      this.content.bindTemplate(id, { sessionId, objectId: object.id, recordIds }, { data: object.data, current: object.current });
    return id;
  }
  instantiate(templateId: string, sessionId: string): void {
    const row = this.db.prepare("SELECT title, data_json FROM templates WHERE id = ?").get(templateId) as
      { title: string; data_json: string } | undefined;
    if (!row) throw new SessionError("not_found", "Template not found.");
    const value = templateDataSchema.parse(JSON.parse(row.data_json));
    for (const object of value.objects) this.resources.validateState(object.kind, object.data);
    const identities = new Map(value.objects.map(object => [object.id, createResourceId()]));
    this.tree.create(row.title, sessionId);
    for (const object of value.objects) {
      const id = identities.get(object.id)!;
      for (const entry of object.current) {
        this.content.bind({ sessionId, objectId: id, templateId }, { kind: "data", id: entry.contract }, entry.data);
        this.data.set(sessionId, id, entry.contract, entry.data);
      }
      this.workbench.insert(sessionId, { id, kind: object.kind, title: object.title, data: object.data },
        value.views.find(view => view.objectId === object.id)?.position ?? this.workbench.placement(sessionId, object.kind), { templateId });
    }
    for (const view of value.views) this.workbench.mutate({
      type: "view.set", sessionId, ...view, objectId: identities.get(view.objectId)!,
    });
    for (const link of value.links) this.workbench.mutate({
      type: "link.set", sessionId, linked: true,
      receiverId: identities.get(link.receiverId)!, resourceId: identities.get(link.resourceId)!,
    });
  }
  delete(id: string): void {
    this.content.releaseTemplate(id);
    this.db.prepare("DELETE FROM templates WHERE id = ?").run(id);
  }
}
