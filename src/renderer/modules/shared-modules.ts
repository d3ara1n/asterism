import * as React from "react";
import * as ReactJsx from "react/jsx-runtime";
import * as ReactDom from "react-dom";
import * as ReactDomClient from "react-dom/client";
import * as ReactIntl from "react-intl";
import * as zod from "zod";
import * as Sonner from "sonner";
import * as Motion from "motion/react";
import * as sdkContracts from "@asterism-app/sdk/contracts";
import * as sdkRenderer from "@asterism-app/sdk/renderer";
import uiPackage from "../../../packages/ui/package.json";
import { rendererSharedModules, sharedUiPackage } from "../../shared/renderer-modules.ts";

const root = "../../../packages/ui/";
const sources = import.meta.glob<Record<string, unknown>>(["../../../packages/ui/src/**/*.{ts,tsx}", "!**/*.test.ts"], { eager: true });

/** Map each public export of the shared UI package to the module the host already loaded for it. */
function uiModules(): Record<string, Record<string, unknown>> {
  const modules: Record<string, Record<string, unknown>> = {};
  for (const [key, target] of Object.entries(uiPackage.exports)) {
    const [prefix, suffix = ""] = target.split("*");
    for (const [path, module] of Object.entries(sources)) {
      const file = `./${path.slice(root.length)}`;
      if (target.includes("*") ? !(file.startsWith(prefix!) && file.endsWith(suffix)) : file !== target) continue;
      const name = target.includes("*") ? key.replace("*", file.slice(prefix!.length, file.length - suffix.length)) : key;
      modules[`${sharedUiPackage}${name.slice(1)}`] = module;
    }
  }
  return modules;
}

const fixed: Record<string, Record<string, unknown>> = {
  react: React, "react/jsx-runtime": ReactJsx, "react-dom": ReactDom, "react-dom/client": ReactDomClient,
  "react-intl": ReactIntl, zod, sonner: Sonner, "motion/react": Motion,
  "@asterism-app/sdk/contracts": sdkContracts, "@asterism-app/sdk/renderer": sdkRenderer,
};
for (const id of rendererSharedModules) if (!fixed[id]) throw new Error(`The host table lacks shared renderer module ${id}.`);

/** Plugin bundles resolve these imports to the host instances, keeping React, Radix providers, toasts and motion settings single. */
export const hostRendererModules: Record<string, Record<string, unknown>> = { ...fixed, ...uiModules() };
