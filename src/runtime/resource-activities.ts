import { randomUUID } from "node:crypto";
import { resourceActivitySchema, type ResourceActivity, type ResourceRef, type UiText } from "@asterism-app/sdk/contracts";

/** Live presentation scopes, not task occupancy or notification history. The caller owns work lifetime. */
export class ResourceActivities {
  private readonly entries = new Map<string, ResourceActivity>();
  constructor(private readonly changed: () => void) {}
  read(): ResourceActivity[] { return structuredClone([...this.entries.values()]); }
  /** Stop presentation before the event transport closes; owned work still settles through its execution lifetime. */
  clear(): void { this.entries.clear(); }
  begin(resource: ResourceRef, title: UiText) {
    const entry: ResourceActivity = { id: randomUUID(), resource: { ...resource }, title: structuredClone(title) };
    this.entries.set(entry.id, entry);
    this.changed();
    return {
      progress: (value: number | null) => {
        if (!this.entries.has(entry.id)) return;
        const progress = value === null ? undefined : resourceActivitySchema.shape.progress.unwrap().parse({ value });
        if (progress?.value === entry.progress?.value) return;
        if (progress) entry.progress = progress;
        else delete entry.progress;
        this.changed();
      },
      close: () => { if (this.entries.delete(entry.id)) this.changed(); },
    };
  }
}
