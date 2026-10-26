import messages from "./locales/zh-Hans.json" with { type: "json" };
import type { TranslationCatalog } from "./i18n.ts";
/** 宿主纯数据目录；main 与 renderer 共用，不依赖插件或窗口初始化。 */
export const hostCatalog: TranslationCatalog = { owner: "asterism.host", locale: "zh-Hans", revision: "builtin", messages };
