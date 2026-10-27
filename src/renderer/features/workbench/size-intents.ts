import type { CardSize, WorkbenchSnapshot } from "../../../shared/workbench";

export type SizeIntent = { size: CardSize | null; readCompleted: boolean };

/** An intent whose read failed after acceptance can be confirmed by a later successful projection; retain intents whose read barrier has not finished. */
export function confirmCardSizes(pending: Map<string, SizeIntent>, snapshot: WorkbenchSnapshot): void {
  for (const [id, intent] of pending) {
    const actual = snapshot.views.find(view => view.objectId === id)?.size ?? null;
    if (!snapshot.objects.some(object => object.id === id)
      || (intent.readCompleted && actual?.width === intent.size?.width && actual?.height === intent.size?.height)) {
      pending.delete(id);
    }
  }
}

/** Only completion of the read after this command's acceptance can confirm its intent; an old snapshot with identical dimensions is not confirmation. */
export async function saveCardSize({ pending, objectId, size, saveAndRead, read, project }: {
  pending: Map<string, SizeIntent>; objectId: string; size: CardSize | null;
  saveAndRead: () => Promise<boolean>;
  read: () => WorkbenchSnapshot | null;
  project: (snapshot: WorkbenchSnapshot | null) => void;
}): Promise<void> {
  const intent: SizeIntent = { size, readCompleted: false };
  pending.set(objectId, intent);
  project(read());
  const saved = await saveAndRead();
  if (pending.get(objectId) !== intent) return;
  const snapshot = read();
  if (saved) {
    intent.readCompleted = true;
    if (!snapshot) return;
    confirmCardSizes(pending, snapshot);
  } else pending.delete(objectId);
  project(snapshot);
}
