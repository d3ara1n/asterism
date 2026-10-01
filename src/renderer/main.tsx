import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ApplicationController } from "./app/controller";
import { ErrorBoundary } from "./app/ErrorBoundary";
import "./styles.css";

const controller = new ApplicationController(window.weft);
createRoot(document.getElementById("root")!).render(<StrictMode><ErrorBoundary><App controller={controller} /></ErrorBoundary></StrictMode>);
