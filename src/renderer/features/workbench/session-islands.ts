import { useRendererCalls } from "@asterism-app/sdk/renderer";
import { useEffect, useRef } from "react";

import type { SessionIsland, WorkbenchSnapshot } from "../../../shared/workbench";
import { useModuleViews } from "../../modules/views";
import { restoreIslands } from "../../shared/weave/model";
import { useIsland, useIslandStrip, type IslandSpec, type StripIsland, type StripState } from "../../shared/weave/Screen";
import { resolveResourceIsland } from "../plugins/scope";
import type { WorkbenchOperation } from "../session/controller";
import type { WorkbenchStore } from "./context";
import { objectIslandSpec } from "./ObjectIsland";

/** The restorable arrangement of a strip: islands with restore content, owners kept only when they are the root or another persisted island. */
function persistedIslands(state: StripState, root: string): SessionIsland[] {
  const persisted = state.islands.filter(island => island.spec.restore);
  const ids = new Set(persisted.map(island => island.id));
  return persisted.map(island => ({
    id: island.id, size: island.size, view: island.spec.restore!,
    owner: island.owner !== null && (island.owner === root || ids.has(island.owner)) ? island.owner : null,
  }));
}

/**
 * Session island lifecycle within the workbench: restore the stored arrangement on mount, record it while the strip belongs to this session,
 * and close islands whose content left the current projection. Unrestorable entries are dropped without affecting the others.
 */
export function useSessionIslands({ session, run, store, onHome }: {
  session: WorkbenchSnapshot; run: (command: WorkbenchOperation) => Promise<boolean>; store: WorkbenchStore; onHome: () => void;
}) {
  const strip = useIslandStrip();
  const root = useIsland().id;
  const registry = useModuleViews();
  const calls = useRendererCalls();
  const latest = useRef({ session, run, onHome });
  latest.current = { session, run, onHome };

  useEffect(() => {
    let cancelled = false;
    const sessionId = latest.current.session.id;
    void (async () => {
      const restored: StripIsland[] = [];
      const renamed = new Map<string, string>();
      for (const entry of latest.current.session.islands) {
        const { session } = latest.current;
        let spec: IslandSpec | null = null;
        if (entry.view.kind === "object") {
          const objectId = entry.view.objectId;
          const object = session.objects.find(item => item.id === objectId);
          spec = object ? objectIslandSpec({ store, sessionId, object, origin: null, onHome: () => latest.current.onHome() }) : null;
        } else {
          const resourceId = entry.view.resourceId;
          spec = await resolveResourceIsland(registry, calls, session.objects.find(item => item.id === resourceId && !item.retiring), sessionId, entry.view);
          if (cancelled) return;
        }
        if (!spec) continue;
        renamed.set(entry.id, spec.id);
        restored.push({ id: spec.id, owner: entry.owner, size: entry.size, spec });
      }
      if (cancelled) return;
      // Islands opened while restoring stay after the restored arrangement.
      const current = strip.getSnapshot().islands;
      const open = new Set(current.map(island => island.id));
      const rebuilt = restored.filter(island => !open.has(island.id))
        .map(island => island.owner === null ? island : { ...island, owner: renamed.get(island.owner) ?? island.owner });
      strip.set({ islands: [...restoreIslands(rebuilt, new Set([root, ...open])), ...current], scope: sessionId });
    })();
    return () => { cancelled = true; };
  }, [strip, root, registry, calls, store]);

  useEffect(() => {
    let saved: string | null = null;
    return strip.subscribe(() => {
      const state = strip.getSnapshot();
      const { session, run } = latest.current;
      if (state.scope !== session.id) return;
      const islands = persistedIslands(state, root);
      const serialized = JSON.stringify(islands);
      if (saved === null) saved = JSON.stringify(session.islands);
      if (serialized === saved) return;
      saved = serialized;
      void run({ type: "islands.set", sessionId: session.id, islands });
    });
  }, [strip, root]);

  // Removed or retiring content invalidates its island and the islands it opened; their guards no longer protect live content.
  useEffect(() => {
    const live = new Set(session.objects.filter(object => !object.retiring).map(object => object.id));
    for (const island of strip.getSnapshot().islands) {
      const view = island.spec.restore;
      if (view && !live.has(view.kind === "object" ? view.objectId : view.resourceId)) void strip.close(island.id, { force: true });
    }
  }, [session.objects, strip]);
}
