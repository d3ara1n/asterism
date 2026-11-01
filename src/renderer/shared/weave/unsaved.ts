import { useEffect } from "react";

const drafts = new Map<symbol, string>();
function beforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = "";
}

/** Native shutdown and reload consult the same unsaved surfaces as in-app island closure. */
export function useUnsavedChanges(title: string, dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const id = Symbol();
    drafts.set(id, title);
    window.host.window.setUnsavedChanges([...drafts.values()]);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      drafts.delete(id);
      window.host.window.setUnsavedChanges([...drafts.values()]);
      if (drafts.size === 0) window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [title, dirty]);
}
