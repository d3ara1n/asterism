import messages from "./locales/zh-Hans.json" with { type: "json" };
import type { TranslationCatalog } from "./i18n.ts";
/** Host pure-data catalogs shared by main and renderer without plugin or window initialization dependencies. */
export const hostCatalog: TranslationCatalog = { owner: "asterism.host", locale: "zh-Hans", revision: "builtin", messages };
