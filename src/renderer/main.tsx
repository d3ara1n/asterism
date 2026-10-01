import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { App } from "./app/App";
import { ApplicationController } from "./app/controller";
import { ErrorBoundary } from "./app/ErrorBoundary";
import "./styles.css";
import { locale } from "./shared/i18n";

document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";

const controller = new ApplicationController(window.weft);
createRoot(document.getElementById("root")!).render(<StrictMode><ErrorBoundary><MotionConfig reducedMotion="user"><App controller={controller} /></MotionConfig></ErrorBoundary></StrictMode>);
