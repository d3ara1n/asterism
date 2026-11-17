import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildPlugin } from "./index.js";

const { values } = parseArgs({ options: { root: { type: "string", default: "." }, help: { type: "boolean", short: "h" } } });
if (values.help) {
  console.log("Usage: asterism-plugin-build [--root <package-directory>]");
} else {
  const result = await buildPlugin({ root: resolve(values.root!) });
  console.log(`Built ${result.artifact.id}: ${result.outputDirectory}`);
}
