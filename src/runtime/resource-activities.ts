import { randomUUID } from "node:crypto";
import { resourceActivitySchema, type ResourceActivity, type ResourceRef, type UiText } from "@asterism-app/sdk/contracts";

const progressSchema = resourceActivitySchema.options[0].shape.progress.unwrap();

/** Live presentation scopes, not task occupancy or notification history. The caller owns their lifetime. */
export class ResourceActivities {
  private readonly entries = new Map<string, ResourceActivity>();
  private closed = false;
  constructor(private readonly changed: () => void) {}
  read(): ResourceActivity[] { return structuredClone([...this.entries.values()]); }
  /** Stop presentation before the event transport closes, including instances that finish starting during shutdown. */
  close(): void { this.closed = true; this.entries.clear(); }
  private identify(resource: ResourceRef, title: UiText) {
    return { id: randomUUID(), resource: { ...resource }, title: structuredClone(title) };
  }
  private add(entry: ResourceActivity) {
    if (!this.closed) {
      this.entries.set(entry.id, entry);
      this.changed();
    }
    return () => { if (this.entries.delete(entry.id)) this.changed(); };
  }
  openInstance(resource: ResourceRef, title: UiText): () => void {
    return this.add({ ...this.identify(resource, title), kind: "instance" });
  }
  begin(resource: ResourceRef, title: UiText) {
    const entry: Extract<ResourceActivity, { kind: "work" }> = { ...this.identify(resource, title), kind: "work" };
    const close = this.add(entry);
    return {
      progress: (value: number | null) => {
        if (!this.entries.has(entry.id)) return;
        const progress = value === null ? undefined : progressSchema.parse({ value });
        if (progress?.value === entry.progress?.value) return;
        if (progress) entry.progress = progress;
        else delete entry.progress;
        this.changed();
      },
      close,
    };
  }
}
