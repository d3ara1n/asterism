import { ViewRegistry, type RendererModule } from "../renderer/modules/registry";

const entries = import.meta.glob<RendererModule>("./*/renderer.tsx", { eager: true, import: "default" });
/** 前端只收集视图入口及纯契约；不导入后台模块。 */
export const moduleViews = new ViewRegistry(Object.keys(entries).sort().map(path => entries[path]!));
