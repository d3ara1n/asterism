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

document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";

startAppearance();
const controller = new ApplicationController(window.weft);
createRoot(document.getElementById("root")!).render(<StrictMode><ErrorBoundary><MotionConfig reducedMotion="user"><TooltipProvider><App controller={controller} /></TooltipProvider></MotionConfig></ErrorBoundary></StrictMode>);
