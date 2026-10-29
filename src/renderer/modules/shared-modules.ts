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
import uiModules from "virtual:asterism/shared-ui";
import { rendererSharedModules } from "../../shared/renderer-modules.ts";

const fixed: Record<string, Record<string, unknown>> = {
  react: React, "react/jsx-runtime": ReactJsx, "react-dom": ReactDom, "react-dom/client": ReactDomClient,
  "react-intl": ReactIntl, zod, sonner: Sonner, "motion/react": Motion,
  "@asterism-app/sdk/contracts": sdkContracts, "@asterism-app/sdk/renderer": sdkRenderer,
};
for (const id of rendererSharedModules) if (!fixed[id]) throw new Error(`The host table lacks shared renderer module ${id}.`);

/** Plugin bundles resolve these imports to the host instances, keeping React, Radix providers, toasts and motion settings single. */
export const hostRendererModules: Record<string, Record<string, unknown>> = { ...fixed, ...uiModules };
