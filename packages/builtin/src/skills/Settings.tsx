import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useI18n, useRendererCalls, useRendererEvents } from "@atelier/sdk/renderer";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@atelier/ui/ui/item";
import { Spinner } from "@atelier/ui/ui/spinner";
import { skillsMessages as messages } from "../messages/skills";
import { ReadSkills, RefreshSkills, SkillsChanged, type SkillOverview } from "./contract";

/** 设置只呈现技能概要；正文与配套文件由模型按需读取。 */
export function SkillSettings() {
  const i18n = useI18n(), calls = useRendererCalls(), events = useRendererEvents();
  const [catalog, setCatalog] = useState<SkillOverview | null>(null);
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false);
  const active = useRef<AbortController | null>(null);
  const load = useCallback(async (refresh: boolean) => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller; setLoading(true); setFailed(false);
    try {
      const value = await calls.invoke(refresh ? RefreshSkills : ReadSkills, {}, { signal: controller.signal });
      if (!controller.signal.aborted) setCatalog(value);
    } catch { if (!controller.signal.aborted) setFailed(true); }
    finally { if (!controller.signal.aborted) { active.current = null; setLoading(false); } }
  }, [calls]);
  useEffect(() => {
    const controller = new AbortController();
    const subscription = events.subscribe(SkillsChanged, { delivery: "latest", signal: controller.signal }, ({ data }) => { setCatalog(data); });
    void subscription.ready.then(() => { if (!controller.signal.aborted) void load(false); }, () => {
      if (!controller.signal.aborted) { setFailed(true); setLoading(false); }
    });
    return () => { controller.abort(); active.current?.abort(); active.current = null; };
  }, [load, events]);
  return <div className="flex flex-col gap-3">
    <div className="flex items-center justify-between gap-2">
      <p className="type-caption break-all">{catalog?.source ?? "~/.agents/skills"}</p>
      <IconButton label={i18n.text(messages.refresh)} disabled={loading} onClick={() => { void load(true); }}><RefreshCw /></IconButton>
    </div>
    {loading && <p className="type-caption flex items-center gap-2"><Spinner />{i18n.text(messages.loading)}</p>}
    {failed && <p className="type-caption text-destructive" role="alert">{i18n.text(messages.failed)}</p>}
    {catalog && <>
      {!catalog.skills.length && <p className="type-caption">{i18n.text(messages.empty)}</p>}
      {!!catalog.skills.length && <ItemGroup className="surface">{catalog.skills.flatMap((skill, index) => {
        const row = <Item key={skill.name}><ItemContent>
          <ItemTitle className="break-all">{skill.name}</ItemTitle>
          <ItemDescription className="line-clamp-none whitespace-pre-wrap">{skill.description}</ItemDescription>
        </ItemContent></Item>;
        return index ? [<ItemSeparator key={`${skill.name}-separator`} />, row] : [row];
      })}</ItemGroup>}
      {!!catalog.issues.length && <div role="alert" className="type-caption text-destructive">
        <p>{i18n.text(messages.issues)}</p>
        {catalog.issues.map((issue, index) => <p key={`${issue.file}:${index}`} className="break-all">{issue.file}: {issue.message}</p>)}
      </div>}
    </>}
  </div>;
}
