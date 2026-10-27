import { LanguageSettings } from "./LanguageSettings";
import { SessionsSettings } from "./SessionsSettings";
import { AboutSettings } from "./AboutSettings";
import { AppearanceSettings } from "../appearance/AppearanceSettings";
import { ModelProvidersSettings } from "../configuration/ModelProvidersSettings";
import { WebProvidersSettings } from "../configuration/WebProvidersSettings";
import { RolesSettings } from "../configuration/RolesSettings";
import { AgentsSettings } from "../configuration/AgentsSettings";
import { PluginsOverview, PluginDetails, usePlugins, pluginKey, type PluginManager } from "../plugins/PluginsSettings";
import { pluginsMessages } from "../../messages/plugins";
import { Item, ItemContent, ItemTitle, ItemDescription } from "@asterism-app/ui/ui/item";
import { Separator } from "@asterism-app/ui/ui/separator";
import { AnimatePresence, motion } from "motion/react";

import { Card } from "@asterism-app/ui/ui/card";

import { Button } from "@asterism-app/ui/ui/button";
import { ArrowLeft, Info, Palette, Cpu, PlugZap, Bot, type LucideProps } from "lucide-react";
import { ConfigurationReadStatus } from "../configuration/forms";
import { ConfigurationContext, useConfiguration } from "../configuration/state";
import { Screen, useIsland, type IslandSpec } from "../../shared/weave/Screen";
import { settingsMessages } from "../../messages/settings";
import { useI18n } from "../../shared/i18n";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";

/** The official Card carries the detail animation; component source remains unchanged. */
const MotionCard = motion.create(Card);
import { fadeTransition, islandTransition } from "../../shared/weave/motion";

/** Settings category registry: add a category by appending one entry. Include only categories with a clear purpose. */
export type SettingsCategoryId = "general" | "appearance" | "providers" | "roles" | "agents" | "about";
interface SettingsCategory { id: SettingsCategoryId; title: import("@asterism-app/sdk/contracts").UiText; summary: import("@asterism-app/sdk/contracts").UiText; icon: ComponentType<LucideProps>; content: () => ReactNode }

const categories: SettingsCategory[] = [
  { id: "general", title: settingsMessages.generalTitle, summary: settingsMessages.generalSummary, icon: Info, content: () => <><LanguageSettings /><SessionsSettings /></> },
  { id: "appearance", title: settingsMessages.appearance, summary: settingsMessages.appearanceSummary, icon: Palette, content: () => <AppearanceSettings /> },
  { id: "providers", title: settingsMessages.providers, summary: settingsMessages.providersSummary, icon: PlugZap, content: () => <><ModelProvidersSettings /><WebProvidersSettings /></> },
  { id: "roles", title: settingsMessages.rolesTitle, summary: settingsMessages.rolesSummary, icon: Cpu, content: () => <RolesSettings /> },
  { id: "agents", title: settingsMessages.agents, summary: settingsMessages.agentsSummary, icon: Bot, content: () => <AgentsSettings /> },
  { id: "about", title: settingsMessages.aboutTitle, summary: settingsMessages.aboutSummary, icon: Info, content: () => <AboutSettings /> },
];

/**
 * Settings screen: the root island initially shows category cards tiled over the material; opening a category fades out the overview and scales and fades in category content from the clicked card's transform origin,
 * reversing toward the same origin when closing. Animate only opacity/transform, without layout interpolation. Category content can open deeper islands on the right (such as provider details).
 */
export type SettingsTarget = ({ category: SettingsCategoryId } | { pluginId: string; location?: string }) & { sequence: number };
function SettingsRoot({ openId, onOpen, onClosed, manager, location }: { openId: string | null; onOpen: (id: string) => void; onClosed: () => void; manager: PluginManager; location?: string }) {
  const i18n = useI18n();
  const island = useIsland();
  const stage = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const lastCard = useRef<string | null>(null);
  const overviewScroll = useRef(0);
  // Transform origin shared by details and overview (relative to the stage): use the center of the last clicked card; when opened directly from outside, reuse the previous origin or top center.
  const [origin, setOrigin] = useState("50% 0px");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const plugin = manager.list.find(plugin => pluginKey(plugin) === openId);
  const open = categories.find(category => category.id === openId) ?? (plugin ? {
    id: pluginKey(plugin), title: plugin.metadata.name ?? plugin.id ?? pluginsMessages.unknownPlugin,
    content: () => <PluginDetails plugin={plugin} manager={manager} location={location} />,
  } : undefined);

  useEffect(() => { if (openId) heading.current?.focus({ preventScroll: true }); }, [openId]);
  const openCard = (id: string) => {
    const card = cards.current.get(id)?.getBoundingClientRect(), base = stage.current?.getBoundingClientRect();
    if (card && base) setOrigin(`${card.left + card.width / 2 - base.left}px ${card.top + card.height / 2 - base.top}px`);
    onOpen(id);
  };
  const close = async () => {
    if (!openId || !(await island.closeChild())) return;
    lastCard.current = openId;
    onClosed();
  };

  return <div ref={stage} className="settings-stage" onKeyDown={event => {
    if (event.key === "Escape" && open && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <h1 className="sr-only">{i18n.formatMessage(settingsMessages.settings)}</h1>
    {/* Details are absolutely positioned over the overview, and both enter and exit simultaneously; the overview recedes slightly around the origin while details grow from the card position. */}
    <AnimatePresence initial={false}
      onExitComplete={() => { const id = lastCard.current; if (id) cards.current.get(id)?.focus({ preventScroll: true }); lastCard.current = null; }}>
      {!open ? <motion.div key="grid" className="flex h-full flex-col gap-8 overflow-y-auto"
        ref={node => { if (node) node.scrollTop = overviewScroll.current; }}
        onScroll={event => { overviewScroll.current = event.currentTarget.scrollTop; }}
        style={{ transformOrigin: origin }}
        initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={fadeTransition}>
        <section className="shrink-0" aria-labelledby="application-settings-title">
          <header className="mb-4 space-y-2">
            <h2 id="application-settings-title" className="type-section">{i18n.text(pluginsMessages.application)}</h2>
            <p className="type-caption">{i18n.text(pluginsMessages.applicationSummary)}</p>
          </header>
          <div className="settings-grid">
        {categories.map(({ id, title, summary, icon: Icon }) => <Item key={id} variant="outline" asChild className="surface h-full hover:bg-accent"><button type="button" className="settings-card group"
          ref={node => { if (node) cards.current.set(id, node); else cards.current.delete(id); }}
          onClick={() => openCard(id)}>
          <ItemContent>
            <Icon className="mb-2 size-4 text-muted-foreground" aria-hidden="true" />
            <ItemTitle>{i18n.text(title)}</ItemTitle><ItemDescription>{i18n.text(summary)}</ItemDescription>
          </ItemContent>
        </button></Item>)}
          </div>
        </section>
        <Separator />
        <PluginsOverview manager={manager} query={query} filter={filter} onQuery={setQuery} onFilter={setFilter}
          onOpen={openCard} cardRef={(id, node) => { if (node) cards.current.set(id, node); else cards.current.delete(id); }} />
      </motion.div> : <MotionCard layoutScroll key={`detail-${open.id}`} className="settings-detail gap-0 py-0" style={{ transformOrigin: origin }}
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96, transition: fadeTransition }}
        transition={islandTransition}>
        <div className="p-6">
          <Button variant="ghost" size="sm" className="-ml-2 mb-4" onClick={() => void close()}><ArrowLeft />{i18n.formatMessage(settingsMessages.allSettings)}</Button>
          {/* The About page uses the application identity card as its visible heading; retain the category title only for assistive technology and as a focus target. */}
          <h2 ref={heading} tabIndex={-1} className={open.id === "about" ? "sr-only" : "type-page mb-2 outline-none"}>{i18n.text(open.title)}</h2>
          {["providers", "roles", "agents"].includes(open.id) && <ConfigurationReadStatus />}
          {open.content()}
        </div>
      </MotionCard>}
    </AnimatePresence>
  </div>;
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
    if ("category" in target) {
      appliedTarget.current = target; setLocation(undefined); setOpenId(target.category);
      return;
    }
    const plugin = manager.list.find(plugin => plugin.id === target.pluginId);
    if (plugin) { appliedTarget.current = target; setLocation(target.location); setOpenId(pluginKey(plugin)); }
  }, [active, target, manager.list]);
  useEffect(() => {
    if (openId?.startsWith("plugin:") && !manager.list.some(plugin => pluginKey(plugin) === openId)) setOpenId(null);
  }, [openId, manager.list]);
  // Return to the category overview when leaving settings (recreate the screen and clear deeper islands).
  // Reset after the page strip finishes sliding and settings leave the viewport, avoiding visible reconstruction during exit.
  useEffect(() => {
    if (active) return;
    const timer = window.setTimeout(() => { setOpenId(null); setGeneration(g => g + 1); }, pageMotion());
    return () => window.clearTimeout(timer);
  }, [active]);
  const root: IslandSpec = {
    id: "settings", label: i18n.formatMessage(settingsMessages.settings), surface: false,
    // Center the overview according to content; opening a category requires a wider minimum width, overflowing alongside detail islands in narrow windows.
    width: openId ? { min: 440, grow: 1, max: 720 } : { min: 320, grow: 1, max: 768 },
    render: () => <SettingsRoot openId={openId} onOpen={id => { setLocation(undefined); setOpenId(id); }}
      onClosed={() => { setLocation(undefined); setOpenId(null); }} manager={manager} location={location} />,
  };
  return <ConfigurationContext.Provider value={configuration}><Screen key={generation} label={i18n.formatMessage(settingsMessages.settings)} root={root} className="h-full" /></ConfigurationContext.Provider>;
}
