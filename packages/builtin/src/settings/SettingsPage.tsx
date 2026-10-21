import { useEffect, useRef, useState } from "react";
import { useI18n, useRendererConfiguration } from "@atelier/sdk/renderer";
import { BuiltinSettings, settingsMessages as messages } from "./contract";
import { Item, ItemContent, ItemTitle, ItemActions, ItemGroup, ItemSeparator } from "@atelier/ui/ui/item";
import { Switch } from "@atelier/ui/ui/switch";
import { Button } from "@atelier/ui/ui/button";
import { Alert, AlertDescription } from "@atelier/ui/ui/alert";
import { Spinner } from "@atelier/ui/ui/spinner";
import type { UiText } from "@atelier/sdk/contracts";

/** 页面自行分组，普通偏好即时提交；配置存储和通知由宿主托管。 */
export function BuiltinSettingsPage({ location }: { location?: string }) {
  const i18n = useI18n();
  const config = useRendererConfiguration(BuiltinSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const thinking = useRef<HTMLElement>(null), tools = useRef<HTMLElement>(null), peek = useRef<HTMLElement>(null);
  useEffect(() => {
    const target = location === "thinking" ? thinking.current : location === "tools" ? tools.current : location === "peek" ? peek.current : null;
    target?.scrollIntoView({ block: "nearest" }); target?.focus({ preventScroll: true });
  }, [location]);
  const save = async (work: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await work(); }
    catch (failure) { setError((failure as { display?: UiText }).display ?? messages.saveFailed); }
    finally { setBusy(false); }
  };
  const row = (key: keyof typeof config.value, label: UiText) => <Item key={key}>
    <ItemContent><ItemTitle>{i18n.text(label)}</ItemTitle></ItemContent>
    <ItemActions><Switch checked={config.value[key]} disabled={busy || !config.ready} aria-label={i18n.text(label)}
      onCheckedChange={checked => { void save(() => config.save({ ...config.value, [key]: checked })); }} /></ItemActions>
  </Item>;
  return <div className="flex flex-col gap-6">
    {(error || config.error) && <Alert variant="destructive"><AlertDescription>{i18n.text(error ?? config.error!)}
      <Button variant="outline" size="sm" disabled={busy} onClick={() => { void save(config.refresh); }}>{i18n.text(messages.retry)}</Button>
    </AlertDescription></Alert>}
    {config.status === "invalid" && <Alert><AlertDescription>{i18n.text(messages.invalid)}</AlertDescription></Alert>}
    {!config.ready && !config.error && <p className="type-caption flex items-center gap-2"><Spinner />{i18n.text(messages.loading)}</p>}
    <section ref={thinking} tabIndex={-1} className="outline-none">
      <h3 className="type-section mb-2">{i18n.text(messages.thinking)}</h3>
      <ItemGroup className="surface">{row("thinkingAutoExpand", messages.thinkingAutoExpand)}<ItemSeparator />{row("thinkingAutoCollapse", messages.thinkingAutoCollapse)}</ItemGroup>
    </section>
    <section ref={tools} tabIndex={-1} className="outline-none">
      <h3 className="type-section mb-2">{i18n.text(messages.tools)}</h3>
      <ItemGroup className="surface">{row("toolInputAutoExpand", messages.toolInputAutoExpand)}<ItemSeparator />{row("toolInputAutoCollapse", messages.toolInputAutoCollapse)}</ItemGroup>
    </section>
    <section ref={peek} tabIndex={-1} className="outline-none">
      <h3 className="type-section mb-2">{i18n.text(messages.peek)}</h3>
      <ItemGroup className="surface">{row("peekAutoExpand", messages.peekAutoExpand)}<ItemSeparator />{row("peekAutoCollapse", messages.peekAutoCollapse)}</ItemGroup>
    </section>
    <div><Button variant="outline" size="sm" disabled={busy || !config.ready} onClick={() => { void save(config.reset); }}>{busy && <Spinner />}{i18n.text(messages.reset)}</Button></div>
  </div>;
}
