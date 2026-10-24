import { LanguageSettings } from "./LanguageSettings";
import { SessionsSettings } from "./SessionsSettings";
import { AppearanceSettings } from "../appearance/AppearanceSettings";
import { ModelProvidersSettings } from "../configuration/ModelProvidersSettings";
import { WebProvidersSettings } from "../configuration/WebProvidersSettings";
import { RolesSettings } from "../configuration/RolesSettings";
import { AgentsSettings } from "../configuration/AgentsSettings";
import { PluginsOverview, PluginDetails, usePlugins, pluginKey, type PluginManager } from "../plugins/PluginsSettings";
import { pluginsMessages } from "../../messages/plugins";
import { Item, ItemContent, ItemTitle, ItemDescription } from "@atelier/ui/ui/item";
import { Separator } from "@atelier/ui/ui/separator";
import { Row } from "./layout";
import { LayoutGroup, AnimatePresence, motion } from "motion/react";

import { Card } from "@atelier/ui/ui/card";

import { Button } from "@atelier/ui/ui/button";
import { ArrowLeft, Info, Palette, Cpu, PlugZap, Bot, type LucideProps } from "lucide-react";
import { ConfigurationReadStatus } from "../configuration/forms";
import { ConfigurationContext, useConfiguration } from "../configuration/state";
import { Screen, useIsland, type IslandSpec } from "../../shared/weave/Screen";
import { settingsMessages } from "../../messages/settings";
import { useI18n } from "../../shared/i18n";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";

import { applicationId } from "../../../shared/application";

/** 官方 Card 作为共享元素动画的承载元素；组件源码不改。 */
const MotionCard = motion.create(Card);
import { fadeTransition, islandTransition } from "../../shared/weave/motion";

/** 设置分类注册表：新增分类只需追加一项。仅列入有明确用途的分类。 */
interface SettingsCategory { id: string; title: import("@atelier/sdk/contracts").UiText; summary: import("@atelier/sdk/contracts").UiText; icon: ComponentType<LucideProps>; content: () => ReactNode }

const categories: SettingsCategory[] = [
  { id: "general", title: settingsMessages.generalTitle, summary: settingsMessages.generalSummary, icon: Info, content: () => <><LanguageSettings /><SessionsSettings /></> },
  { id: "appearance", title: settingsMessages.appearance, summary: settingsMessages.appearanceSummary, icon: Palette, content: () => <AppearanceSettings /> },
  { id: "providers", title: settingsMessages.providers, summary: settingsMessages.providersSummary, icon: PlugZap, content: () => <><ModelProvidersSettings /><WebProvidersSettings /></> },
  { id: "roles", title: settingsMessages.rolesTitle, summary: settingsMessages.rolesSummary, icon: Cpu, content: () => <RolesSettings /> },
  { id: "agents", title: settingsMessages.agents, summary: settingsMessages.agentsSummary, icon: Bot, content: () => <AgentsSettings /> },
  { id: "about", title: settingsMessages.aboutTitle, summary: settingsMessages.aboutSummary, icon: Info, content: () => <About /> },
];

function About() {
  const i18n = useI18n();
  return <>
    <p className="type-body py-4 text-muted-foreground">{i18n.text(settingsMessages.aboutBody)}</p>
    <Row label={i18n.text(settingsMessages.aboutIdentity)}><code className="text-xs">{applicationId}</code></Row>
    <Row label={i18n.text(settingsMessages.aboutLogs)} hint={i18n.text(settingsMessages.aboutLogsHint)}>
      <Button size="sm" variant="outline" onClick={() => void window.host.openLogs().then(error => { if (error) console.error(`Log folder could not be opened: ${error}`); })}>
        {i18n.text(settingsMessages.aboutOpenLogs)}</Button></Row>
  </>;
}

/**
 * 设置屏：根浮岛先是平铺在材质上的分类卡片；打开分类时选中卡片经共享布局（layoutId）放大为分类内容，
 * 其余卡片收缩消失。分类内容可在右侧打开更深的浮岛（如提供商详情）。
 */
export interface SettingsTarget { pluginId: string; location?: string; sequence: number }
function SettingsRoot({ openId, onOpen, onClosed, manager, location }: { openId: string | null; onOpen: (id: string) => void; onClosed: () => void; manager: PluginManager; location?: string }) {
  const i18n = useI18n();
  const island = useIsland();
  const heading = useRef<HTMLHeadingElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const lastCard = useRef<string | null>(null);
  const overviewScroll = useRef(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const plugin = manager.list.find(plugin => pluginKey(plugin) === openId);
  const open = categories.find(category => category.id === openId) ?? (plugin ? {
    id: pluginKey(plugin), title: plugin.metadata.name ?? plugin.id ?? pluginsMessages.unknownPlugin,
    content: () => <PluginDetails plugin={plugin} manager={manager} location={location} />,
  } : undefined);

  useEffect(() => { if (openId) heading.current?.focus({ preventScroll: true }); }, [openId]);
  const close = async () => {
    if (!openId || !(await island.closeChild())) return;
    lastCard.current = openId;
    onClosed();
  };

  return <LayoutGroup id="settings"><div className="settings-stage" onKeyDown={event => {
    if (event.key === "Escape" && open && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <h1 className="sr-only">{i18n.formatMessage(settingsMessages.settings)}</h1>
    <AnimatePresence mode="popLayout" initial={false}
      onExitComplete={() => { const id = lastCard.current; if (id) cards.current.get(id)?.focus({ preventScroll: true }); lastCard.current = null; }}>
      {!open ? <motion.div key="grid" className="flex h-full flex-col gap-8 overflow-y-auto"
        ref={node => { if (node) node.scrollTop = overviewScroll.current; }}
        onScroll={event => { overviewScroll.current = event.currentTarget.scrollTop; }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeTransition}>
        <section className="shrink-0" aria-labelledby="application-settings-title">
          <header className="mb-4"><h2 id="application-settings-title" className="type-section">{i18n.text(pluginsMessages.application)}</h2></header>
          <div className="settings-grid">
        {categories.map(({ id, title, summary, icon: Icon }) => <Item key={id} variant="outline" asChild className="surface h-full hover:bg-accent"><motion.button type="button" className="settings-card group"
          layoutId={`settings-card-${id}`} transition={islandTransition}
          initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
          ref={node => { if (node) cards.current.set(id, node); else cards.current.delete(id); }}
          onClick={() => onOpen(id)}>
          <ItemContent>
            <Icon className="mb-2 size-4 text-muted-foreground" aria-hidden="true" />
            <ItemTitle>{i18n.text(title)}</ItemTitle><ItemDescription>{i18n.text(summary)}</ItemDescription>
          </ItemContent>
        </motion.button></Item>)}
          </div>
        </section>
        <Separator />
        <PluginsOverview manager={manager} query={query} filter={filter} onQuery={setQuery} onFilter={setFilter}
          onOpen={onOpen} cardRef={(id, node) => { if (node) cards.current.set(id, node); else cards.current.delete(id); }} />
      </motion.div> : <MotionCard key={`detail-${open.id}`} layoutId={`settings-card-${open.id}`} transition={islandTransition}
        className="settings-detail gap-0 py-0" style={{ borderRadius: "calc(var(--radius) + 4px)" }}>
        <motion.div className="p-6" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { ...islandTransition, delay: 0.18 } }} exit={{ opacity: 0, transition: fadeTransition }}>
          <Button variant="ghost" size="sm" className="-ml-2 mb-4" onClick={() => void close()}><ArrowLeft />{i18n.formatMessage(settingsMessages.allSettings)}</Button>
          <h2 ref={heading} tabIndex={-1} className="type-page mb-2 outline-none">{i18n.text(open.title)}</h2>
          {["providers", "roles", "agents"].includes(open.id) && <ConfigurationReadStatus />}
          {open.content()}
        </motion.div>
      </MotionCard>}
    </AnimatePresence>
  </div></LayoutGroup>;
}

const pageMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0
  : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion-page")) || 380;

export function SettingsPage({ active, target }: { active: boolean; target: SettingsTarget | null }) {
  const i18n = useI18n();
  const configuration = useConfiguration(active);
  const [openId, setOpenId] = useState<string | null>(null);
  const [location, setLocation] = useState<string | undefined>();
  const [generation, setGeneration] = useState(0);
  const manager = usePlugins(active);
  const appliedTarget = useRef<SettingsTarget | null>(null);
  useEffect(() => {
    if (!active || !target || appliedTarget.current === target) return;
    const plugin = manager.list.find(plugin => plugin.id === target.pluginId);
    if (plugin) { appliedTarget.current = target; setLocation(target.location); setOpenId(pluginKey(plugin)); }
  }, [active, target, manager.list]);
  useEffect(() => {
    if (openId?.startsWith("plugin:") && !manager.list.some(plugin => pluginKey(plugin) === openId)) setOpenId(null);
  }, [openId, manager.list]);
  // 离开设置页时回到分类总览（重建屏，清除更深的浮岛）。
  // 等页面带平移结束、设置已移出视口后再重置，避免离场过程中可见的重建。
  useEffect(() => {
    if (active) return;
    const timer = window.setTimeout(() => { setOpenId(null); setGeneration(g => g + 1); }, pageMotion());
    return () => window.clearTimeout(timer);
  }, [active]);
  const root: IslandSpec = {
    id: "settings", label: i18n.formatMessage(settingsMessages.settings), surface: false,
    // 总览按内容居中；打开分类后要求更宽的最小宽度，窄窗口下与详情浮岛并列时溢出。
    width: openId ? { min: 440, grow: 1, max: 720 } : { min: 320, grow: 1, max: 768 },
    render: () => <SettingsRoot openId={openId} onOpen={id => { setLocation(undefined); setOpenId(id); }}
      onClosed={() => { setLocation(undefined); setOpenId(null); }} manager={manager} location={location} />,
  };
  return <ConfigurationContext.Provider value={configuration}><Screen key={generation} label={i18n.formatMessage(settingsMessages.settings)} root={root} className="h-full" /></ConfigurationContext.Provider>;
}
