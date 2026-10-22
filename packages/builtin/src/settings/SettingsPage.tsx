import { useEffect, useRef, useState } from "react";
import { useI18n, useRendererConfiguration } from "@atelier/sdk/renderer";
import { BuiltinSettings, settingsMessages as messages } from "./contract";
import { Item, ItemContent, ItemTitle, ItemActions, ItemGroup, ItemSeparator } from "@atelier/ui/ui/item";
import { Switch } from "@atelier/ui/ui/switch";
import { Button } from "@atelier/ui/ui/button";
import { Alert, AlertDescription } from "@atelier/ui/ui/alert";
import { Spinner } from "@atelier/ui/ui/spinner";
import type { UiText } from "@atelier/sdk/contracts";
import { ShellSettings } from "../shell/Settings";
import { shellMessages } from "../messages/shell";

/** 页面自行分组，普通偏好即时提交；配置存储和通知由宿主托管。 */
export function BuiltinSettingsPage({ location }: { location?: string }) {
  const i18n = useI18n();
  const config = useRendererConfiguration(BuiltinSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const streaming = useRef<HTMLElement>(null), shell = useRef<HTMLElement>(null);
  useEffect(() => {
    const target = location === "streaming" ? streaming.current : location === "shell" ? shell.current : null;
    target?.scrollIntoView({ block: "nearest" }); target?.focus({ preventScroll: true });
  }, [location]);
  /** 返回是否保存成功，展开编辑的 profile 失败时保留草稿。 */
  const save = async (work: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await work(); return true; }
    catch (failure) { setError((failure as { display?: UiText }).display ?? messages.saveFailed); return false; }
    finally { setBusy(false); }
  };
  const row = (key: Exclude<keyof typeof config.value, "shell">, label: UiText) => <Item key={key}>
    <ItemContent><ItemTitle>{i18n.text(label)}</ItemTitle></ItemContent>
    <ItemActions><Switch checked={config.value[key]} disabled={busy || !config.ready} aria-label={i18n.text(label)}
      onCheckedChange={checked => { void save(() => config.save({ ...config.value, [key]: checked })); }} /></ItemActions>
  </Item>;
  return <div className="flex flex-col gap-6">
    {/* 恢复默认设置作用于整个插件配置，放在页面级而非任一分区内。 */}
    <div className="flex justify-end">
      <Button variant="outline" size="sm" disabled={busy || !config.ready} onClick={() => { void save(config.reset); }}>{busy && <Spinner />}{i18n.text(messages.reset)}</Button>
    </div>
    {(error || config.error) && <Alert variant="destructive"><AlertDescription>{i18n.text(error ?? config.error!)}
      <Button variant="outline" size="sm" disabled={busy} onClick={() => { void save(config.refresh); }}>{i18n.text(messages.retry)}</Button>
    </AlertDescription></Alert>}
    {config.status === "invalid" && <Alert><AlertDescription>{i18n.text(messages.invalid)}</AlertDescription></Alert>}
    {!config.ready && !config.error && <p className="type-caption flex items-center gap-2"><Spinner />{i18n.text(messages.loading)}</p>}
    <section ref={streaming} tabIndex={-1} className="outline-none">
      <h3 className="type-section mb-2">{i18n.text(messages.streaming)}</h3>
      <ItemGroup className="surface">{row("autoExpand", messages.autoExpand)}<ItemSeparator />{row("autoCollapse", messages.autoCollapse)}</ItemGroup>
    </section>
    <section ref={shell} tabIndex={-1} className="outline-none">
      <h3 className="type-section mb-2">{i18n.text(shellMessages.title)}</h3>
      <ShellSettings value={config.value.shell} disabled={busy || !config.ready}
        save={value => save(() => config.save({ ...config.value, shell: value }))} />
    </section>
  </div>;
}
