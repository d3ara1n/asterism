import { nanoid } from "nanoid";
import { Agent } from "@asterism-app/builtin-api/contracts";
import { agentServices } from "@asterism-app/builtin-api/runtime";
import { PluginApiError, type ObjectReader, type PluginContext, type ToolCaller } from "@asterism-app/sdk/runtime";
import { defaultChannelId, Mesh, MeshState, type MeshCardData, type MeshTarget } from "./contract.ts";
import { allocationSchema, memberKey, reconcileMembers, type Allocations, type Member, type Membership } from "./members.ts";

export interface MeshAccess {
  channelId: string;
  channelName: string;
  members: readonly Member[];
}

/** Shared channel directory and durable name allocations; membership is derived from current session links. */
export class MeshService {
  private readonly db;
  private allocations: Allocations;
  private members: Member[] = [];
  private views = new Map<string, string>();
  private readonly detached = new Set<string>();

  constructor(private readonly plugin: PluginContext) {
    this.db = plugin.db();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mesh_channels (id TEXT PRIMARY KEY, title TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mesh_numbering (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), data TEXT NOT NULL);
    `);
    this.db.prepare("INSERT OR IGNORE INTO mesh_channels VALUES (?, ?)").run(defaultChannelId, "Default");
    const row = this.db.prepare("SELECT data FROM mesh_numbering WHERE singleton = 1").get();
    this.allocations = row ? allocationSchema.parse(JSON.parse(String(row.data))) : [];
  }

  state(object: ObjectReader) {
    const state = object.get(MeshState);
    if (!state) throw new PluginApiError("unavailable", "The Mesh state is unavailable.");
    return state;
  }

  channels(): { id: string; title: string }[] {
    return this.db.prepare("SELECT id, title FROM mesh_channels ORDER BY rowid").all()
      .map(row => ({ id: String(row.id), title: String(row.title) }));
  }
  requireChannel(id: string): void {
    if (!this.channels().some(channel => channel.id === id)) throw new PluginApiError("not_found", "The Mesh channel is unavailable.");
  }
  createChannel(title: string): string {
    const id = nanoid();
    this.db.prepare("INSERT INTO mesh_channels VALUES (?, ?)").run(id, title);
    return id;
  }
  renameChannel(id: string, title: string): void {
    this.requireChannel(id);
    this.db.prepare("UPDATE mesh_channels SET title = ? WHERE id = ?").run(title, id);
    this.refresh();
  }
  attach(id: string): void { this.detached.delete(id); this.refresh(); }
  detach(id: string): void { this.detached.add(id); this.refresh(); }
  view(object: ObjectReader): MeshCardData {
    return { channelId: this.state(object).channelId,
      channels: this.channels().map(channel => ({ ...channel, agents: this.members.filter(member => member.channelId === channel.id).length })) };
  }

  refresh(): void {
    if (this.plugin.lifetime.signal.aborted) return;
    const sources: Membership[] = [], meshes: ObjectReader[] = [];
    for (const session of this.plugin.sessions.list()) {
      const snapshot = this.plugin.session(session.id).snapshot();
      for (const resource of snapshot.resources.all()) {
        if (resource.ref.kind !== Mesh.kind || this.detached.has(resource.ref.id)) continue;
        const object = this.plugin.object(session.id, Mesh, resource.ref.id);
        meshes.push(object);
        const state = this.state(object);
        this.requireChannel(state.channelId);
        for (const agent of snapshot.resources.linkedTo(resource.ref)) {
          if (agent.ref.kind !== Agent.kind) continue;
          sources.push({ channelId: state.channelId, mesh: resource.ref, ref: agent.ref, title: agent.title,
            type: agentServices(this.plugin).describe(agent.ref).type, description: state.profiles[memberKey(agent.ref)] ?? "" });
        }
      }
    }
    const next = reconcileMembers(this.allocations, sources);
    const encoded = JSON.stringify(next.allocations);
    if (encoded !== JSON.stringify(this.allocations)) {
      this.db.prepare("INSERT INTO mesh_numbering VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET data = excluded.data").run(encoded);
      this.allocations = next.allocations;
    }
    this.members = next.members;
    const views = new Map<string, string>();
    for (const object of meshes) {
      const value = JSON.stringify(this.view(object));
      views.set(object.ref.id, value);
      if (this.views.get(object.ref.id) !== value) this.plugin.object(object.ref.sessionId, Mesh, object.ref.id).invalidate();
    }
    this.views = views;
  }

  capture(object: ObjectReader): MeshAccess {
    this.refresh();
    const channelId = this.state(object).channelId;
    return { channelId, channelName: this.channels().find(channel => channel.id === channelId)!.title,
      members: structuredClone(this.members.filter(member => member.channelId === channelId)) };
  }
  resolve(access: MeshAccess, target: MeshTarget): Member {
    const member = access.members.find(member => member.profile.title === target.title && member.profile.id === (target.id ?? 0));
    if (!member) throw new PluginApiError("not_found",
      `No Agent named ${JSON.stringify(target.title)} with id ${target.id ?? 0} is exposed to this channel in this request. list returns available names, IDs, types, and task descriptions.`);
    return member;
  }
  profile(member: Member) {
    return { ...member.profile, descriptions: [...new Set(member.meshes.map(ref =>
      this.state(this.plugin.object(ref.sessionId, Mesh, ref.id)).profiles[memberKey(member.ref)] ?? "").filter(Boolean))] };
  }
  ownProfile(object: ObjectReader, caller: ToolCaller, access: MeshAccess) {
    const member = access.members.find(member => memberKey(member.ref) === memberKey(caller.ref));
    const description = this.state(object).profiles[memberKey(caller.ref)] ?? "";
    return { title: caller.title, id: member?.profile.id ?? null, type: agentServices(this.plugin).describe(caller.ref).type,
      descriptions: description ? [description] : [] };
  }
}
