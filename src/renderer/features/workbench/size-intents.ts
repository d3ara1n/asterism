import type { CardSize, WorkbenchSnapshot } from "../../../shared/workbench";

export type SizeIntent = { size: CardSize | null; readCompleted: boolean };

/** 受理后读取失败的意图，可在后续成功投影中确认；未结束读取屏障的意图继续保留。 */
export function confirmCardSizes(pending: Map<string, SizeIntent>, snapshot: WorkbenchSnapshot): void {
  for (const [id, intent] of pending) {
    const actual = snapshot.views.find(view => view.objectId === id)?.size ?? null;
    if (!snapshot.objects.some(object => object.id === id)
      || (intent.readCompleted && actual?.width === intent.size?.width && actual?.height === intent.size?.height)) {
      pending.delete(id);
    }
  }
}

/** 只有本次命令受理后的读取结束，才能确认意图；相同尺寸的旧快照不构成确认。 */
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
