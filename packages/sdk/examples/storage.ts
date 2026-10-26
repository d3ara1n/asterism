import { z } from "zod";
import { defineStorage } from "@atelier/sdk/runtime";

/**
 * 存储入口：package.json 中 `"atelier": { "storage": "./src/storage.ts" }` 指向本文件。
 * 宿主在插件运行时之前单独导入它，只依赖格式声明本身；每一步只解释自己接收的历史形状。
 */
export default defineStorage([
  {
    // 托管配置：`plugin.config` 读写时处理 `{ version, data }` 信封，插件仍消费配置值。
    kind: "json", path: ".atelier/config.json", version: 2,
    migrations: {
      1: raw => {
        const old = z.object({ greeting: z.string() }).parse(raw);
        return { ...old, enabled: true };
      },
    },
  },
  {
    // 托管数据库：首次创建时宿主写入当前 `user_version`，迁移在宿主事务内执行同步 SQL。
    kind: "sqlite", path: ".atelier/db.sqlite", version: 2,
    migrations: {
      1: db => db.exec("ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;"),
    },
  },
]);
