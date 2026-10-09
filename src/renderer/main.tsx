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
import { moduleViews } from "../modules/renderer";

document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";

startAppearance();
const controller = new ApplicationController(window.weft);
createRoot(document.getElementById("root")!).render(<StrictMode><ErrorBoundary><MotionConfig reducedMotion="user"><TooltipProvider>
  <ModuleViewsProvider registry={moduleViews}><App controller={controller} /></ModuleViewsProvider>
</TooltipProvider></MotionConfig></ErrorBoundary></StrictMode>);
