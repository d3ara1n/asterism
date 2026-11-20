import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildPlugin } from "@asterism-app/plugin-build";
import { runtimeImportsFile } from "./bundle-runtime-imports.ts";

const { outputDirectory, runtimeImports } = await buildPlugin({ root: "packages/builtin" });
await writeFile(join(outputDirectory, runtimeImportsFile), JSON.stringify(runtimeImports));
