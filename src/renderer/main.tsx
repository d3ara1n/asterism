import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { App } from "./app/App";
import { ApplicationController } from "./app/controller";
import { ErrorBoundary } from "./app/ErrorBoundary";
import "./styles.css";
import { locale } from "./shared/i18n";
import { startAppearance } from "./features/appearance/state";
import { TooltipProvider } from "./shared/ui/tooltip";
import { ModuleViewsProvider } from "./modules/views";
import { builtinViews } from "../modules/renderer";
import { ViewRegistry } from "./modules/registry";
import { loadPluginRenderers } from "./modules/plugins";
import { loadPreferences } from "./features/creation/preferences";

document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";

startAppearance();
const controller = new ApplicationController(window.host);
// 插件视图只在启动时加载；内置视图之后合并，重复契约使该插件视图被忽略。
const initial = await window.host.execute({ type: "workspace.read" }).catch(() => null);
const plugins = initial?.ok ? initial.snapshot.plugins.flatMap(p => p.status === "loaded" && p.renderer && p.id ? [{ id: p.id, renderer: p.renderer }] : []) : [];
const { modules } = await loadPluginRenderers(plugins);
const accepted = [...builtinViews];
for (const module of modules) {
  try { new ViewRegistry([...accepted, module]); accepted.push(module); }
  catch (error) { console.error("Plugin views conflict with existing views and were skipped.", error); }
}
const moduleViews = new ViewRegistry(accepted);
await loadPreferences();
createRoot(document.getElementById("root")!).render(<StrictMode><ErrorBoundary><MotionConfig reducedMotion="user"><TooltipProvider>
  <ModuleViewsProvider registry={moduleViews}><App controller={controller} /></ModuleViewsProvider>
</TooltipProvider></MotionConfig></ErrorBoundary></StrictMode>);
