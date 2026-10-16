import { LanguageSettings } from "./LanguageSettings";
import { AppearanceSettings } from "../appearance/AppearanceSettings";
import { ProvidersSettings } from "../configuration/ProvidersSettings";
import { RolesSettings } from "../configuration/RolesSettings";
import { AgentsSettings } from "../configuration/AgentsSettings";
import { PluginsSettings } from "../plugins/PluginsSettings";
import { Row } from "./layout";
import { LayoutGroup, AnimatePresence, motion } from "motion/react";

import { CardHeader, CardTitle, CardDescription, Card } from "@atelier/ui/ui/card";

import { Button } from "@atelier/ui/ui/button";
import { ArrowLeft, Info, Palette, Cpu, PlugZap, Bot, Puzzle, type LucideProps } from "lucide-react";
import { ConfigurationStatus } from "../configuration/forms";
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
  { id: "general", title: settingsMessages.generalTitle, summary: settingsMessages.generalSummary, icon: Info, content: () => <LanguageSettings /> },
  { id: "appearance", title: settingsMessages.appearance, summary: settingsMessages.appearanceSummary, icon: Palette, content: () => <AppearanceSettings /> },
  { id: "providers", title: settingsMessages.providers, summary: settingsMessages.providersSummary, icon: PlugZap, content: () => <ProvidersSettings /> },
  { id: "roles", title: settingsMessages.rolesTitle, summary: settingsMessages.rolesSummary, icon: Cpu, content: () => <RolesSettings /> },
  { id: "agents", title: settingsMessages.agents, summary: settingsMessages.agentsSummary, icon: Bot, content: () => <AgentsSettings /> },
  { id: "plugins", title: settingsMessages.plugins, summary: settingsMessages.pluginsSummary, icon: Puzzle, content: () => <PluginsSettings /> },
  { id: "about", title: settingsMessages.aboutTitle, summary: settingsMessages.aboutSummary, icon: Info, content: () => <About /> },
];

function About() {
  const i18n = useI18n();
  return <>
    <p className="type-body py-4 text-muted-foreground">{i18n.text(settingsMessages.aboutBody)}</p>
    <Row label={i18n.text(settingsMessages.aboutIdentity)}><code className="text-xs">{applicationId}</code></Row>
  </>;
}

/**
 * 设置屏：根浮岛先是平铺在材质上的分类卡片；打开分类时选中卡片经共享布局（layoutId）放大为分类内容，
 * 其余卡片收缩消失。分类内容可在右侧打开更深的浮岛（如提供商详情）。
 */
function SettingsRoot({ openId, onOpen, onClosed }: { openId: string | null; onOpen: (id: string) => void; onClosed: () => void }) {
  const i18n = useI18n();
  const island = useIsland();
  const heading = useRef<HTMLHeadingElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const lastCard = useRef<string | null>(null);
  const open = categories.find(category => category.id === openId);

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
      {!open ? <motion.div key="grid" className="settings-grid"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeTransition}>
        {categories.map(({ id, title, summary, icon: Icon }) => <motion.button key={id} type="button" className="settings-card group"
          layoutId={`settings-card-${id}`} transition={islandTransition}
          initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
          ref={node => { if (node) cards.current.set(id, node); else cards.current.delete(id); }}
          onClick={() => onOpen(id)}>
          <Card className="h-full gap-0 py-4 transition-colors group-hover:bg-accent"><CardHeader className="gap-1.5 px-4">
            <Icon className="mb-2 size-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle>{i18n.text(title)}</CardTitle><CardDescription>{i18n.text(summary)}</CardDescription>
          </CardHeader></Card>
        </motion.button>)}
      </motion.div> : <MotionCard key={`detail-${open.id}`} layoutId={`settings-card-${open.id}`} transition={islandTransition}
        className="settings-detail gap-0 py-0" style={{ borderRadius: "calc(var(--radius) + 4px)" }}>
        <motion.div className="p-6" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { ...islandTransition, delay: 0.18 } }} exit={{ opacity: 0, transition: fadeTransition }}>
          <Button variant="ghost" size="sm" className="-ml-2 mb-4" onClick={() => void close()}><ArrowLeft />{i18n.formatMessage(settingsMessages.allSettings)}</Button>
          <h2 ref={heading} tabIndex={-1} className="type-page mb-2 outline-none">{i18n.text(open.title)}</h2>
          {["providers", "roles", "agents"].includes(open.id) && <ConfigurationStatus />}
          {open.content()}
        </motion.div>
      </MotionCard>}
    </AnimatePresence>
  </div></LayoutGroup>;
}

const pageMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0
  : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion-page")) || 380;

export function SettingsPage({ active }: { active: boolean }) {
  const i18n = useI18n();
  const configuration = useConfiguration(active);
  const [openId, setOpenId] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
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
    render: () => <SettingsRoot openId={openId} onOpen={setOpenId} onClosed={() => setOpenId(null)} />,
  };
  return <ConfigurationContext.Provider value={configuration}><Screen key={generation} label={i18n.formatMessage(settingsMessages.settings)} root={root} className="h-full" /></ConfigurationContext.Provider>;
}
