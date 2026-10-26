import { defineStorage } from "@atelier/sdk/runtime";

/** 内置插件的存储入口，与外部插件的 manifest `atelier.storage` 同形；不导入业务运行时。 */
export default defineStorage([
  { kind: "json", path: ".atelier/config.json", version: 1, migrations: {} },
]);
