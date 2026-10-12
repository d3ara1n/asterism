import * as React from "react";
import * as ReactJsx from "react/jsx-runtime";
import * as ReactDom from "react-dom";
import * as ReactDomClient from "react-dom/client";
import * as ReactIntl from "react-intl";
import * as zod from "zod";
import * as sdkContracts from "@atelier/sdk/contracts";
import * as sdkRenderer from "@atelier/sdk/renderer";
import type { RendererModule } from "@atelier/sdk/renderer";

/** 共享模块白名单：插件 bundle 的这些导入解析到宿主同一实例，保证只有一个 React。 */
(globalThis as Record<string, unknown>).__atelierRendererModules = {
  react: React, "react/jsx-runtime": ReactJsx, "react-dom": ReactDom, "react-dom/client": ReactDomClient,
  zod, "@atelier/sdk/contracts": sdkContracts, "@atelier/sdk/renderer": sdkRenderer,
  "react-intl": ReactIntl,
};

export interface PluginRendererFailure { id: string; error: string }
/** 加载启动时已打包的插件视图入口；单个失败只跳过该插件。 */
export async function loadPluginRenderers(entries: readonly { id: string; renderer: string }[]):
  Promise<{ modules: RendererModule[]; failures: PluginRendererFailure[] }> {
  const modules: RendererModule[] = [];
  const failures: PluginRendererFailure[] = [];
  for (const entry of entries) {
    try {
      const loaded = await import(/* @vite-ignore */ `atelier-plugin://${entry.renderer}`) as { default?: RendererModule };
      const module = loaded.default;
      if (!module || !Array.isArray(module.resources) || !Array.isArray(module.cards) || !Array.isArray(module.tools)
        || (module.creations !== undefined && !Array.isArray(module.creations))) {
        throw new Error("The renderer entry must default-export { resources, cards, tools }.");
      }
      modules.push(module);
    } catch (error) {
      console.error(`Plugin ${entry.id} renderer could not be loaded.`, error);
      failures.push({ id: entry.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { modules, failures };
}
