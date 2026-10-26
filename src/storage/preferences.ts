import { join } from "node:path";
import { z } from "zod";
import { defaultAppearance } from "../shared/theme.ts";
import { uiStateDefaults } from "../shared/ui-state.ts";
import { jsonStorage } from "./migrations.ts";

/** 主进程偏好使用平铺文档，保留 electron-store 的逐键读写。无版本文件为基线 0。 */
export function preferenceStorages(root: string, platform: string, includePrerelease: boolean) {
  const defaults = {
    appearance: { appearance: defaultAppearance(platform) },
    language: { preference: "system" },
    "ui-state": uiStateDefaults,
    updates: { includePrerelease },
  };
  return Object.entries(defaults).map(([name, initial]) => jsonStorage({
    id: name, file: join(root, `${name}.json`), version: 1, unversioned: true,
    initial: () => ({ version: 1, ...initial }),
    migrations: { 0: raw => ({ ...z.record(z.string(), z.unknown()).parse(raw), version: 1 }) },
    validate: raw => z.object({ version: z.literal(1) }).passthrough().parse(raw),
  }));
}
