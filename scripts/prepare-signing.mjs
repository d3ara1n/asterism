import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// osx-sign scans every unpacked file concurrently before applying signing filters.
// Keep its file detection and signing behavior while avoiding EMFILE during traversal.
// Upstream tracking: https://github.com/electron/osx-sign/pull/286
const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve("app-builder-lib/package.json"));
const metadataFile = builderRequire.resolve("@electron/osx-sign/package.json");
const { version } = JSON.parse(readFileSync(metadataFile, "utf8"));
if (version !== "1.3.3") throw new Error(`Review the signing traversal patch for @electron/osx-sign ${version}.`);

const opening = "        return await Promise.all(children.map(async (child) => {\n";
const closing = "        }));\n    }\n    const allPaths = await _walkAsync(dirPath);";
const sequential = "        const results = [];\n        for (const child of children) {\n            results.push(await (async () => {\n";
const changes = ["cjs", "esm"].map(realm => {
  const file = join(dirname(metadataFile), "dist", realm, "util.js");
  const source = readFileSync(file, "utf8");
  if (source.includes(sequential) && !source.includes(opening)) return { file, content: source };
  const start = source.indexOf(opening), end = source.indexOf(closing, start);
  if (start < 0 || end < 0 || source.indexOf(opening, start + opening.length) !== -1)
    throw new Error(`The signing traversal patch does not match ${file}.`);
  const body = source.slice(start + opening.length, end).split("\n").map(line => line ? `    ${line}` : line).join("\n");
  const content = source.slice(0, start) + sequential + body
    + "            })());\n        }\n        return results;\n    }\n    const allPaths = await _walkAsync(dirPath);"
    + source.slice(end + closing.length);
  return { file, content };
});
for (const { file, content } of changes) writeFileSync(file, content);
console.log(`Prepared bounded signing traversal for @electron/osx-sign ${version}.`);
