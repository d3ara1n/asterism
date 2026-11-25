import { ShellSettingsPage } from "../shell/Settings";
import { shellMessages } from "@asterism-app/ui/messages/shell";
import { McpSettings } from "../mcp/Settings";
import { mcpMessages } from "@asterism-app/ui/messages/mcp";
import { InterfaceSettings } from "./InterfaceSettings";
import { NetworkSettings } from "./NetworkSettings";
import { SessionsSettings } from "./SessionsSettings";
import { UsageSettings } from "./UsageSettings";
import { AboutSettings } from "./AboutSettings";
import { AppearanceSettings } from "../appearance/AppearanceSettings";
import { ModelProvidersSettings } from "../configuration/ModelProvidersSettings";
import { MessagingSettings } from "../configuration/MessagingSettings";
import { WebProvidersSettings } from "../configuration/WebProvidersSettings";
import { SkillSettings } from "../skills/SkillsSettings";
import { skillsMessages } from "../../messages/skills";
import { PluginsProvider, PluginsSettings, PluginSettingsContent, usePlugins, type PluginManager } from "../plugins/PluginsSettings";
import { settingsPageKey, usePluginSettingsRegistry } from "../../modules/settings";
import { pluginsMessages } from "../../messages/plugins";
import { AnimatePresence, motion, useIsPresent, type Variants } from "motion/react";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { ItemGroup, ItemSeparator } from "@asterism-app/ui/ui/item";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { cn } from "@asterism-app/ui/utils";
import { ArrowLeft, Info, SlidersHorizontal, Palette, PlugZap, Puzzle, BookOpen, Terminal, Network } from "lucide-react";
import { ConfigurationReadStatus } from "../configuration/forms";
import { ConfigurationContext, useConfiguration } from "../configuration/state";
import { Screen, useIsland, useIslandCancel, type IslandSpec, type ScreenHandle } from "../../shared/weave/Screen";
import { exitTransition, fadeTransition } from "../../shared/weave/motion";
import { indicatorItem, SelectionIndicator } from "../../shared/selection-indicator";
import { settingsMessages } from "../../messages/settings";
import { providersMessages } from "../../messages/providers";
import { useI18n } from "../../shared/i18n";
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode, type Ref, type RefObject } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";

/** Settings category registry: add a category by appending one entry. Include only categories with a clear purpose. */
export type SettingsCategoryId = "general" | "appearance" | "providers" | "plugins" | "skills" | "shell" | "mcp" | "about";
export const isSettingsCategory = (id: string): id is SettingsCategoryId => ["general", "appearance", "providers", "plugins", "skills", "shell", "mcp", "about"].includes(id);
/** Host and plugin entries share one icon contract; the navigation decides size and color. */
type SettingsIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
/** Host categories render with the plugin manager available, for pages that present plugin-contributed material. */
interface SettingsCategory { id: SettingsCategoryId; title: UiText; summary: UiText; icon: SettingsIcon; content: (manager: PluginManager) => ReactNode }
interface SettingsEntry { id: string; title: UiText; summary: UiText; icon: SettingsIcon; source?: { pluginId: string; name: UiText }; content: () => ReactNode }

function ProvidersSettings() {
  const i18n = useI18n();
  return <>
    <ModelProvidersSettings />
    <WebProvidersSettings />
    <MessagingSettings />
    <p className="type-caption mt-3 px-1">{i18n.text(providersMessages.brandNotice)}</p>
  </>;
}

const categories: SettingsCategory[] = [
  { id: "general", title: settingsMessages.generalTitle, summary: settingsMessages.generalSummary, icon: SlidersHorizontal, content: () => <><InterfaceSettings /><NetworkSettings /><SessionsSettings /><UsageSettings /></> },
  { id: "appearance", title: settingsMessages.appearance, summary: settingsMessages.appearanceSummary, icon: Palette, content: () => <AppearanceSettings /> },
  { id: "providers", title: settingsMessages.providers, summary: settingsMessages.providersSummary, icon: PlugZap, content: () => <ProvidersSettings /> },
  { id: "skills", title: skillsMessages.title, summary: skillsMessages.summary, icon: BookOpen, content: manager => <SkillSettings plugins={manager.list} /> },
  { id: "shell", title: shellMessages.title, summary: shellMessages.summary, icon: Terminal, content: () => <ShellSettingsPage /> },
  { id: "mcp", title: mcpMessages.settings, summary: mcpMessages.summary, icon: Network, content: () => <McpSettings /> },
  { id: "plugins", title: pluginsMessages.plugins, summary: pluginsMessages.pluginsSummary, icon: Puzzle, content: () => <PluginsSettings /> },
  { id: "about", title: settingsMessages.aboutTitle, summary: settingsMessages.aboutSummary, icon: Info, content: () => <AboutSettings /> },
];
/** Categories editing the shared host configuration; their bodies render once its snapshot is available. */
const configurationPages = new Set<string>(["providers", "shell", "mcp"]);
/** Root island width at which navigation and the open page sit side by side; narrower roots show one at a time. */
const splitWidth = 560;

/** Host categories form the first group; plugin pages follow, grouped by contributing plugin under its name. */
function groupEntries(entries: readonly SettingsEntry[]) {
  const groups: { key: string; title?: UiText; entries: SettingsEntry[] }[] = [];
  for (const entry of entries) {
    const key = entry.source?.pluginId ?? "";
    let group = groups.find(item => item.key === key);
    if (!group) groups.push(group = { key, title: entry.source?.name, entries: [] });
    group.entries.push(entry);
  }
  return groups;
}

/**
 * Settings root island: category navigation and the page header on the card shell, the open page on an inset sheet.
 * A wide root always shows a page, opening the first category when none is chosen; a narrow root shows the navigation as a list
 * and an opened page in its place with a way back. Category content can open islands at the right end (such as provider details).
 *
 * Motion follows the shared vocabulary: the selection indicator travels between navigation rows, wide page changes move
 * along the navigation order, and narrow pages enter from the side and leave the way they came. Header and sheet share one direction.
 */
export type SettingsTarget = ({ category: SettingsCategoryId } | { pluginId: string; pageId: string; location?: string }) & { sequence: number };
type PageMotion = { axis: "x" | "y"; direction: number };
const pageVariants: Variants = {
  enter: ({ axis, direction }: PageMotion) => axis === "x" ? { opacity: 0, x: direction * 24 } : { opacity: 0, y: direction * 12 },
  center: { opacity: 1, x: 0, y: 0, transition: fadeTransition },
  exit: ({ axis, direction }: PageMotion) => axis === "x"
    ? { opacity: 0, x: -direction * 8, transition: exitTransition } : { opacity: 0, y: -direction * 8, transition: exitTransition },
};

function SettingsRoot({ openId, onOpen, onClosed, onCancel, manager, location }: { openId: string | null; onOpen: (id: string) => void; onClosed: () => void; onCancel: () => void; manager: PluginManager; location?: string }) {
  const i18n = useI18n();
  const island = useIsland();
  const layout = useId();
  const shell = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const lastOpen = useRef<string | null>(null);
  const [wide, setWide] = useState(true);
  const registry = usePluginSettingsRegistry();
  const entries: SettingsEntry[] = [
    ...categories.map(category => ({ ...category, content: () => category.content(manager) })),
    ...Array.from(registry.pages, ([id, page]) => ({ id, title: page.title, summary: page.summary, icon: page.icon ?? Puzzle,
      source: { pluginId: page.pluginId, name: page.pluginName },
      content: () => <PluginSettingsContent key={id} pluginId={page.pluginId} page={page} location={location} /> })),
  ];
  const groups = groupEntries(entries);
  const open = entries.find(entry => entry.id === openId);
  const shown = open ?? (wide ? entries[0] : undefined);
  const shownKey = shown ? `page:${shown.id}` : "list";

  // Direction is derived while rendering so the leaving page and the arriving page read the same value.
  const index = shown ? entries.indexOf(shown) : -1;
  const previous = useRef({ key: shownKey, index, wide });
  const motionRef = useRef<PageMotion>({ axis: "y", direction: 1 });
  if (previous.current.key !== shownKey) {
    motionRef.current = wide && previous.current.wide
      ? { axis: "y", direction: index >= previous.current.index ? 1 : -1 }
      : { axis: "x", direction: shown ? 1 : -1 };
    previous.current = { key: shownKey, index, wide };
  } else previous.current.wide = wide;
  const pageMotion = motionRef.current;

  useLayoutEffect(() => {
    const element = shell.current!;
    const measure = () => setWide(element.clientWidth >= splitWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Side-by-side navigation always shows a page, so a narrowing root keeps the page in view rather than falling back to the list.
  const first = entries[0]!.id;
  useEffect(() => { if (wide && !openId) onOpen(first); }, [wide, openId, first]);
  // Side-by-side navigation keeps focus where the user chose; the one-at-a-time layout moves focus to the page and back to its row.
  useEffect(() => {
    if (wide) return;
    if (openId) heading.current?.focus({ preventScroll: true });
    else if (lastOpen.current) rows.current.get(lastOpen.current)?.focus({ preventScroll: true });
    lastOpen.current = null;
  }, [openId]);

  const select = async (id: string) => {
    if (id === openId || !(await island.closeOwned())) return;
    onOpen(id);
  };
  const back = async () => {
    if (!(await island.closeOwned())) return;
    lastOpen.current = openId;
    onClosed();
  };
  useIslandCancel(async () => {
    if (open && !wide) await back();
    else if (await island.closeOwned()) onCancel();
  });
  const rowRef = (id: string) => (node: HTMLButtonElement | null) => { if (node) rows.current.set(id, node); else rows.current.delete(id); };
  const icon = (entry: SettingsEntry) => <entry.icon className="text-muted-foreground" aria-hidden="true" />;

  return <div ref={shell} className="flex h-full min-h-0 min-w-0 bg-card-shell">
    <h1 className="sr-only">{i18n.formatMessage(settingsMessages.settings)}</h1>
    {wide && <motion.nav layoutScroll aria-label={i18n.formatMessage(settingsMessages.settings)} className="flex w-48 shrink-0 flex-col overflow-y-auto p-2">
      {groups.map(group => <div key={group.key} role="group" aria-label={group.title && i18n.text(group.title)} className="flex flex-col gap-0.5">
        {group.title && <p aria-hidden="true" className="type-label truncate px-3 pt-4 pb-1">{i18n.text(group.title)}</p>}
        {group.entries.map(entry => {
          const selected = entry.id === shown?.id;
          return <div key={entry.id} className="relative">
            {selected && <SelectionIndicator layoutId={`${layout}-indicator`} />}
            <ListRow variant="navigation" media={icon(entry)} className={cn("bg-transparent transition-colors", indicatorItem(selected))}
              title={<span className="block truncate">{i18n.text(entry.title)}</span>} onOpen={() => void select(entry.id)}
              buttonProps={{ ref: rowRef(entry.id), "aria-current": selected ? "page" : undefined }} />
          </div>;
        })}
      </div>)}
    </motion.nav>}
    <div className="flex min-w-0 flex-1 flex-col">
      <header className={cn("relative flex min-h-11 shrink-0 items-center gap-2 overflow-hidden py-2 pr-2", wide ? "pl-5" : "pl-2")}>
        <AnimatePresence initial={false}>
          {!wide && shown && <motion.span key="back" className="shrink-0" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8, transition: exitTransition }} transition={fadeTransition}>
            <IconButton size="icon-xs" label={i18n.formatMessage(settingsMessages.allSettings)} onClick={() => void back()}><ArrowLeft /></IconButton>
          </motion.span>}
        </AnimatePresence>
        <AnimatePresence initial={false} mode="popLayout" custom={pageMotion}>
          <motion.div key={shownKey} custom={pageMotion} variants={pageVariants} initial="enter" animate="center" exit="exit"
            className={cn("flex min-w-0 flex-1 items-baseline gap-2", !wide && !shown && "pl-1")}>
            {shown ? <>
              <PageTitle ref={heading}>{i18n.text(shown.title)}</PageTitle>
              {shown.source && <p className="type-caption min-w-0 truncate">{i18n.formatMessage(pluginsMessages.contributedBy, { plugin_name: i18n.text(shown.source.name) })}</p>}
            </> : <h2 className="type-section min-w-0 truncate">{i18n.formatMessage(settingsMessages.allSettings)}</h2>}
          </motion.div>
        </AnimatePresence>
      </header>
      {/* The root island border plus a 4px inset sets the sheet radius. */}
      <div className={cn("relative mr-1 mb-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-(--radius-inset) bg-card shadow-(--shadow-sheet)", !wide && "ml-1")}>
        <AnimatePresence initial={false} mode="popLayout" custom={pageMotion}>
          <motion.div key={shownKey} layoutScroll custom={pageMotion} variants={pageVariants} initial="enter" animate="center" exit="exit"
            className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain">
            {shown ? <div className="mx-auto max-w-3xl px-5 pt-4 pb-6">
              {configurationPages.has(shown.id) && <ConfigurationReadStatus />}
              {shown.content()}
            </div> : <div className="flex flex-col gap-6 p-4">{groups.map(group => <section key={group.key} aria-label={group.title && i18n.text(group.title)}>
              {group.title && <h2 className="type-label mb-2 px-1">{i18n.text(group.title)}</h2>}
              <ItemGroup className="surface-group">{group.entries.map((entry, index) => <Fragment key={entry.id}>
                {index > 0 && <ItemSeparator />}
                <ListRow opens media={icon(entry)} mediaVariant="icon" title={i18n.text(entry.title)} description={i18n.text(entry.summary)}
                  onOpen={() => void select(entry.id)} buttonProps={{ ref: rowRef(entry.id) }} />
              </Fragment>)}</ItemGroup>
            </section>)}</div>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  </div>;
}

/** The page heading takes the focus target only while present, so a leaving heading never holds it. */
function PageTitle({ ref, children }: { ref: RefObject<HTMLHeadingElement | null>; children: ReactNode }) {
  const present = useIsPresent();
  return <h2 ref={present ? ref : undefined} tabIndex={-1} className="type-section min-w-0 truncate outline-none">{children}</h2>;
}


const pageMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0
  : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion-page")) || 380;

export function SettingsPage({ active, target, onCancel, screenRef }: { active: boolean; target: SettingsTarget | null; onCancel: () => void; screenRef: Ref<ScreenHandle> }) {
  const i18n = useI18n();
  const configuration = useConfiguration(active);
  const [openId, setOpenId] = useState<string | null>(null);
  const [location, setLocation] = useState<string | undefined>();
  const [generation, setGeneration] = useState(0);
  const manager = usePlugins(active);
  const registry = usePluginSettingsRegistry();
  const appliedTarget = useRef<SettingsTarget | null>(null);
  useEffect(() => {
    if (!active || !target || appliedTarget.current === target) return;
    if ("category" in target) {
      appliedTarget.current = target; setLocation(undefined); setOpenId(target.category);
      return;
    }
    const key = settingsPageKey(target.pluginId, target.pageId);
    if (registry.pages.has(key)) { appliedTarget.current = target; setLocation(target.location); setOpenId(key); }
  }, [active, target, registry.pages]);
  useEffect(() => {
    if (openId?.startsWith("plugin:") && !registry.pages.has(openId)) setOpenId(null);
  }, [openId, registry.pages]);
  // Return to the first page when leaving settings (recreate the screen and clear its islands).
  // Reset after the page strip finishes sliding and settings leave the viewport, avoiding visible reconstruction during exit.
  useEffect(() => {
    if (active) return;
    const timer = window.setTimeout(() => { setOpenId(null); setGeneration(g => g + 1); }, pageMotion());
    return () => window.clearTimeout(timer);
  }, [active]);
  const root: IslandSpec = {
    key: "settings", label: i18n.formatMessage(settingsMessages.settings),
    // Narrow windows give way to detail islands; the root then switches to one-at-a-time navigation.
    width: { min: 360, grow: 1, max: 1000 },
    render: () => <SettingsRoot openId={openId} onOpen={id => { setLocation(undefined); setOpenId(id); }}
      onClosed={() => { setLocation(undefined); setOpenId(null); }} onCancel={onCancel} manager={manager} location={location} />,
  };
  // Plugin management islands render beside the root, so they read the manager and settings navigation from this provider.
  const plugins = { manager, openPage: (key: string) => { setLocation(undefined); setOpenId(key); } };
  return <ConfigurationContext.Provider value={configuration}><PluginsProvider value={plugins}>
    <Screen ref={screenRef} key={generation} label={i18n.formatMessage(settingsMessages.settings)} root={root} className="h-full" />
  </PluginsProvider></ConfigurationContext.Provider>;
}
