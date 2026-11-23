import { useCallback, useEffect, useState } from "react";
import { useRendererCalls, useRendererEvents } from "@asterism-app/sdk/renderer";
import { ReadSkills, SkillsChanged, type SkillSource } from "../../../shared/skills";

/** The host skill sources; SkillsChanged keeps every subscriber on the latest refresh result. */
export function useSkillCatalog() {
  const calls = useRendererCalls(), events = useRendererEvents();
  const [catalog, setCatalog] = useState<SkillSource[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    const subscription = events.subscribe(SkillsChanged, { delivery: "latest", signal: controller.signal }, ({ data }) => setCatalog(data));
    void subscription.ready.then(() => calls.invoke(ReadSkills, {}, { signal: controller.signal }))
      .then(value => { if (!controller.signal.aborted) setCatalog(value); },
        () => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [calls, events, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { catalog, failed, retry };
}
