import { useState, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { locale } from "../../shared/i18n";
import { Switch } from "../../shared/ui/switch";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "../../shared/ui/item";
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
  workspace: "工作区",
  confirm: "关闭卡片前确认", confirmHint: "关闭卡片只隐藏视图，不影响授权。",
} : {
  notice: "Preview: this layout is illustrative. Changes are not saved.",
  interface: "Interface", language: "Interface language", languageHint: "Follows your system language by default.", system: "System",
  appearance: "Appearance", appearanceHint: "Content theme. Window material always follows the system.", light: "Light", dark: "Dark",
  motion: "Reduce motion", motionHint: "Turns off page sliding and card expansion.",
  workspace: "Workspace",
  confirm: "Confirm before closing cards", confirmHint: "Closing a card only hides its view and keeps access.",
};

export function PreviewNotice() {
  return <Alert className="mb-2"><Eye /><AlertDescription>{s.notice}</AlertDescription></Alert>;
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
  return <ItemGroup className="rounded-lg border bg-card">
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
        <Row key="c" label={s.confirm} hint={s.confirmHint}><Switch aria-label={s.confirm} checked={confirm} onCheckedChange={setConfirm} /></Row>,
      ]}</Rows>
    </Section>
  </>;
}
