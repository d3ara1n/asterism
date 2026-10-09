import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowLeft, Info, Palette, Cpu, PlugZap, Bot, type LucideProps } from "lucide-react";
import { applicationId } from "../../../shared/desktop";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "../../shared/ui/card";

/** 官方 Card 作为共享元素动画的承载元素；组件源码不改。 */
const MotionCard = motion.create(Card);
import { fadeTransition, islandTransition } from "../../shared/weave/motion";
import { Screen, useIsland, type IslandSpec } from "../../shared/weave/Screen";
import { Row } from "./preview";
import { AppearanceSettings } from "../appearance/AppearanceSettings";
import { ConfigurationContext, s, useConfiguration } from "../configuration/state";
import { ConfigurationStatus } from "../configuration/forms";
import { ProvidersSettings } from "../configuration/ProvidersSettings";
import { RolesSettings } from "../configuration/RolesSettings";
import { AgentsSettings } from "../configuration/AgentsSettings";

/** 设置分类注册表：新增分类只需追加一项。仅列入有明确用途的分类。 */
interface SettingsCategory { id: string; title: string; summary: string; icon: ComponentType<LucideProps>; content: () => ReactNode }

const categories: SettingsCategory[] = [
  { id: "appearance", title: s("Appearance", "外观"), summary: s("Colors, density, and canvas", "配色、密度与画布"), icon: Palette, content: () => <AppearanceSettings /> },
  { id: "providers", title: s("Providers", "提供商"), summary: s("Connections and available models", "连接与具体模型"), icon: PlugZap, content: () => <ProvidersSettings /> },
  { id: "roles", title: t.rolesTitle, summary: s("Reusable model roles", "可复用的模型角色"), icon: Cpu, content: () => <RolesSettings /> },
  { id: "agents", title: s("Agents", "代理"), summary: s("Prompts, tools, and delegation", "提示词、工具与委派配置"), icon: Bot, content: () => <AgentsSettings /> },
  { id: "about", title: t.aboutTitle, summary: t.aboutSummary, icon: Info, content: () => <>
    <p className="type-body py-4 text-muted-foreground">{t.aboutBody}</p>
    <Row label={t.aboutIdentity}><code className="text-xs">{applicationId}</code></Row>
  </> },
];

/**
 * 设置屏：根浮岛先是平铺在材质上的分类卡片；打开分类时选中卡片经共享布局（layoutId）放大为分类内容，
 * 其余卡片收缩消失。分类内容可在右侧打开更深的浮岛（如提供商详情）。
 */
function SettingsRoot({ openId, onOpen, onClosed }: { openId: string | null; onOpen: (id: string) => void; onClosed: () => void }) {
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
    <h1 className="sr-only">{t.settings}</h1>
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
            <CardTitle>{title}</CardTitle><CardDescription>{summary}</CardDescription>
          </CardHeader></Card>
        </motion.button>)}
      </motion.div> : <MotionCard key={`detail-${open.id}`} layoutId={`settings-card-${open.id}`} transition={islandTransition}
        className="settings-detail gap-0 py-0" style={{ borderRadius: "calc(var(--radius) + 4px)" }}>
        <motion.div className="p-6" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { ...islandTransition, delay: 0.18 } }} exit={{ opacity: 0, transition: fadeTransition }}>
          <Button variant="ghost" size="sm" className="-ml-2 mb-4" onClick={() => void close()}><ArrowLeft />{t.allSettings}</Button>
          <h2 ref={heading} tabIndex={-1} className="type-page mb-2 outline-none">{open.title}</h2>
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
    id: "settings", label: t.settings, surface: false,
    // 总览按内容居中；打开分类后要求更宽的最小宽度，窄窗口下与详情浮岛并列时溢出。
    width: openId ? { min: 440, grow: 1, max: 720 } : { min: 320, grow: 1, max: 768 },
    render: () => <SettingsRoot openId={openId} onOpen={setOpenId} onClosed={() => setOpenId(null)} />,
  };
  return <ConfigurationContext.Provider value={configuration}><Screen key={generation} label={t.settings} root={root} className="h-full" /></ConfigurationContext.Provider>;
}
