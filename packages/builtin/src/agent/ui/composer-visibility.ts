/** Owned independently by each card; each mounted UI releases only its own hide request. */
export function createComposerVisibility() {
  const requests = new Set<symbol>();
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => requests.size > 0,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hide() {
      const request = Symbol();
      requests.add(request);
      notify();
      return () => { if (requests.delete(request)) notify(); };
    },
  };
}
