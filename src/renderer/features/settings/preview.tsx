import { useState, type ReactNode } from "react";
import { ChevronRight, CircleCheck, CircleAlert, Plus, PlugZap, Eye, X } from "lucide-react";
import { useIsland } from "../../shared/weave/Screen";
import { locale } from "../../shared/i18n";
import { Button, IconButton } from "../../shared/ui/button";
import { Badge } from "../../shared/ui/badge";
import { Switch } from "../../shared/ui/switch";
import { Input } from "../../shared/ui/input";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { Separator } from "../../shared/ui/separator";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "../../shared/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "../../shared/ui/item";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../shared/ui/select";

/**
 * 设置页的风格预览内容：示意布局与控件，不读写任何配置。
 * 对应能力接入后，用真实数据与能力接口替换本文件，并移除 PreviewNotice。
 */
const zh = locale === "zh";
const s = zh ? {
  notice: "预览：以下内容仅示意布局，修改不会保存。",
  interface: "界面", language: "界面语言", languageHint: "默认跟随系统语言。", system: "跟随系统",
  appearance: "外观", appearanceHint: "内容主题；窗口材质始终跟随系统。", light: "浅色", dark: "深色",
  motion: "减少动态", motionHint: "关闭页面平移与卡片展开动画。",
  workspace: "工作区", restore: "启动时打开上次的任务", restoreHint: "关闭后启动进入空工作区。",
  confirm: "关闭卡片前确认", confirmHint: "关闭卡片只隐藏视图，不影响授权。",
  providers: "提供商", providersHint: "模型提供商保存在本设备，凭据由系统加密存储。", add: "添加提供商",
  connected: "已连接", failed: "连接失败", unconfigured: "未配置",
  models: (n: number) => `${n} 个模型`,
  protocol: "协议", baseUrl: "接口地址", apiKey: "API 密钥", apiKeyHint: "保存后仅显示末四位。",
  test: "测试连接", save: "保存", remove: "移除", defaults: "默认模型", defaultsHint: "新建代理时使用。",
  failedDetail: "401 Unauthorized：密钥无效或已过期。",
  close: "关闭",
} : {
  notice: "Preview: this layout is illustrative. Changes are not saved.",
  interface: "Interface", language: "Interface language", languageHint: "Follows your system language by default.", system: "System",
  appearance: "Appearance", appearanceHint: "Content theme. Window material always follows the system.", light: "Light", dark: "Dark",
  motion: "Reduce motion", motionHint: "Turns off page sliding and card expansion.",
  workspace: "Workspace", restore: "Reopen last task on launch", restoreHint: "When off, Weft starts on an empty workspace.",
  confirm: "Confirm before closing cards", confirmHint: "Closing a card only hides its view and keeps access.",
  providers: "Providers", providersHint: "Providers are saved on this device. Credentials use system encryption.", add: "Add provider",
  connected: "Connected", failed: "Connection failed", unconfigured: "Not configured",
  models: (n: number) => `${n} ${n === 1 ? "model" : "models"}`,
  protocol: "Protocol", baseUrl: "Base URL", apiKey: "API key", apiKeyHint: "Only the last four characters are shown after saving.",
  test: "Test connection", save: "Save", remove: "Remove", defaults: "Default model", defaultsHint: "Used for new agents.",
  failedDetail: "401 Unauthorized: the key is invalid or expired.",
  close: "Close",
};

export function PreviewNotice() {
  return <Alert variant="warning" className="mb-2"><Eye /><AlertDescription>{s.notice}</AlertDescription></Alert>;
}

/** 设置分组：标题 + 圆角分组底板，行之间用分隔线。 */
export function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="mt-6 first:mt-2">
    <div className="mb-2 flex items-end justify-between gap-4 px-1">
      <div><h3 className="type-section">{title}</h3>{hint && <p className="type-caption mt-0.5">{hint}</p>}</div>
      {action}
    </div>
    {children}
  </section>;
}

/** 分组底板内的设置行：左侧标签与说明，右侧控件。 */
export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <Item>
    <ItemContent><ItemTitle>{label}</ItemTitle>{hint && <ItemDescription>{hint}</ItemDescription>}</ItemContent>
    <ItemActions>{children}</ItemActions>
  </Item>;
}

function Rows({ children }: { children: ReactNode[] }) {
  return <ItemGroup className="settings-group">
    {children.flatMap((child, index) => index ? [<ItemSeparator key={`s${index}`} />, child] : [child])}
  </ItemGroup>;
}

function Choice({ label, value, options }: { label: string; value: string; options: [string, string][] }) {
  return <Select defaultValue={value}>
    <SelectTrigger size="sm" aria-label={label} className="w-36"><SelectValue /></SelectTrigger>
    <SelectContent align="end"><SelectGroup>{options.map(([v, text]) => <SelectItem key={v} value={v}>{text}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>;
}

export function GeneralPreview() {
  const [motion, setMotion] = useState(false);
  const [restore, setRestore] = useState(true);
  const [confirm, setConfirm] = useState(false);
  return <>
    <PreviewNotice />
    <Section title={s.interface}>
      <Rows>{[
        <Row key="l" label={s.language} hint={s.languageHint}><Choice label={s.language} value="system" options={[["system", s.system], ["en", "English"], ["zh", "简体中文"]]} /></Row>,
        <Row key="a" label={s.appearance} hint={s.appearanceHint}><Choice label={s.appearance} value="light" options={[["system", s.system], ["light", s.light], ["dark", s.dark]]} /></Row>,
        <Row key="m" label={s.motion} hint={s.motionHint}><Switch aria-label={s.motion} checked={motion} onCheckedChange={setMotion} /></Row>,
      ]}</Rows>
    </Section>
    <Section title={s.workspace}>
      <Rows>{[
        <Row key="r" label={s.restore} hint={s.restoreHint}><Switch aria-label={s.restore} checked={restore} onCheckedChange={setRestore} /></Row>,
        <Row key="c" label={s.confirm} hint={s.confirmHint}><Switch aria-label={s.confirm} checked={confirm} onCheckedChange={setConfirm} /></Row>,
      ]}</Rows>
    </Section>
  </>;
}

type Status = "connected" | "failed" | "unconfigured";
const providers: { id: string; name: string; protocol: string; url: string; status: Status; models: number }[] = [
  { id: "a", name: "Anthropic", protocol: "anthropic", url: "https://api.anthropic.com", status: "connected", models: 3 },
  { id: "b", name: "OpenAI", protocol: "responses", url: "https://api.openai.com/v1", status: "failed", models: 0 },
  { id: "c", name: "Local relay", protocol: "chat", url: "http://localhost:8080/v1", status: "unconfigured", models: 0 },
];
const protocols: [string, string][] = [["anthropic", "Anthropic Messages"], ["responses", "OpenAI Responses"], ["chat", "OpenAI Chat Completions"]];
const statusBadge = (status: Status) => status === "connected" ? <Badge variant="success"><CircleCheck />{s.connected}</Badge>
  : status === "failed" ? <Badge variant="destructive"><CircleAlert />{s.failed}</Badge> : <Badge>{s.unconfigured}</Badge>;

type Provider = typeof providers[number];

/** 模型分类：提供商列表。选择或添加提供商时，在右侧打开详情浮岛。 */
function ProviderDetail({ id }: { id: string | null }) {
  const island = useIsland();
  const current = providers.find(p => p.id === id);
  const failed = current?.status === "failed";
  const key = current?.id ?? "new";
  return <div className="p-6">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0"><h2 className="type-page truncate">{current?.name ?? s.add}</h2></div>
      <div className="flex items-center gap-1">{current && statusBadge(current.status)}<IconButton label={s.close} onClick={island.close}><X /></IconButton></div>
    </div>
    <div key={key} className="settings-group p-4">
      <FieldGroup>
        <Field><FieldLabel htmlFor={`pv-protocol-${key}`}>{s.protocol}</FieldLabel>
          <Select defaultValue={current?.protocol ?? "chat"}><SelectTrigger id={`pv-protocol-${key}`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{protocols.map(([v, text]) => <SelectItem key={v} value={v}>{text}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor={`pv-url-${key}`}>{s.baseUrl}</FieldLabel><Input id={`pv-url-${key}`} defaultValue={current?.url} placeholder="https://" spellCheck={false} /></Field>
        <Field data-invalid={failed || undefined}><FieldLabel htmlFor={`pv-key-${key}`}>{s.apiKey}</FieldLabel>
          <Input id={`pv-key-${key}`} type="password" aria-invalid={failed || undefined} placeholder={!current || current.status === "unconfigured" ? "sk-…" : "••••••••••••3f9a"} />
          {failed ? <FieldError>{s.failedDetail}</FieldError> : <FieldDescription>{s.apiKeyHint}</FieldDescription>}</Field>
        {current?.status === "connected" && <Field><FieldLabel htmlFor={`pv-model-${key}`}>{s.defaults}</FieldLabel>
          <Select defaultValue="claude-sonnet"><SelectTrigger id={`pv-model-${key}`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{["claude-sonnet", "claude-opus", "claude-haiku"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectGroup></SelectContent></Select>
          <FieldDescription>{s.defaultsHint}</FieldDescription></Field>}
      </FieldGroup>
      <Separator className="my-4" />
      <div className="flex items-center justify-between gap-2">
        {current ? <Button variant="ghost" size="sm" className="text-destructive">{s.remove}</Button> : <span />}
        <div className="flex gap-2"><Button variant="secondary">{s.test}</Button><Button>{s.save}</Button></div>
      </div>
    </div>
  </div>;
}

/** 模型分类：提供商列表；详情与添加在右侧的新浮岛中打开。 */
export function ModelsPreview() {
  const island = useIsland();
  const [selected, setSelected] = useState<string | null>(null);
  const openDetail = (id: string | null, origin: HTMLElement) => {
    setSelected(id ?? "new");
    island.open({ id: `provider:${id ?? "new"}`, label: id ? providers.find(p => p.id === id)!.name : s.add,
      width: { min: 360, grow: 1, max: 560 }, origin, render: () => <ProviderDetail id={id} /> });
  };
  const active = island.child ? selected : null;
  return <>
    <PreviewNotice />
    <Section title={s.providers} hint={s.providersHint} action={<Button size="sm" variant="secondary" aria-pressed={active === "new"} onClick={e => openDetail(null, e.currentTarget)}><Plus />{s.add}</Button>}>
      <Rows>{providers.map(p => <Item key={p.id} asChild>
        <button type="button" aria-pressed={p.id === active} onClick={e => openDetail(p.id, e.currentTarget)}>
          <ItemMedia className="settings-item-icon"><PlugZap /></ItemMedia>
          <ItemContent className="min-w-0"><ItemTitle className="truncate">{p.name}</ItemTitle>
            <ItemDescription className="truncate">{protocols.find(([v]) => v === p.protocol)?.[1]} · {s.models(p.models)}</ItemDescription></ItemContent>
          <ItemActions>{statusBadge(p.status)}<ChevronRight className="size-3.5 text-muted-foreground" /></ItemActions>
        </button>
      </Item>)}</Rows>
    </Section>
  </>;
}
