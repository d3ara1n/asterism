import { join, relative, resolve } from "node:path";
import { artifactDirectory, artifactFile, artifactSchema } from "@asterism-app/plugin-build/artifact";
import { applicationManualLayout } from "../src/plugins/distribution-layout.ts";
import { npmLauncher } from "../src/plugins/npm-launcher.ts";
import { runtimeImportsFile } from "./bundle-runtime-imports.ts";
import { dependencyExclusions, dependencyManifest, packageName, readJson, runtimeDependencyNames, type DistributionManifest } from "./release-dependencies.ts";

export const builtinDirectory = "packages/builtin";

export function releaseLayout() {
  const artifact = artifactSchema.parse(readJson(join(builtinDirectory, artifactDirectory, artifactFile)));
  const builtin = readJson<DistributionManifest>(join(builtinDirectory, "package.json"));
  const publicPackages = [...new Set([...Object.keys(artifact.public.runtime), ...Object.keys(artifact.public.renderer)].map(packageName))]
    .filter(name => name !== builtin.name);
  const manuals = (builtin.asterism?.manual ?? []).map(path => `${builtinDirectory}/${path}`);
  const publicManuals = publicPackages.flatMap(name => {
    const manifest = dependencyManifest(builtinDirectory, name);
    if (!manifest) throw new Error(`Missing documentation package ${name}.`);
    const directories = readJson<DistributionManifest>(manifest).asterism?.manual ?? [];
    return directories.map(path => ({ from: relative(resolve("."), join(manifest, "..", path)).replaceAll("\\", "/"), to: `node_modules/${name}/${path}` }));
  });
  const imports = (directory: string) => readJson<string[]>(join(directory, runtimeImportsFile));
  const roots = [
    { directory: "", imports: [...imports("dist/main"), npmLauncher.package, ...applicationManualLayout
      .flatMap(({ to }) => to.startsWith("node_modules/") ? [packageName(to.slice("node_modules/".length))] : [])] },
    { directory: builtinDirectory, imports: [...imports(join(builtinDirectory, artifactDirectory)), ...publicPackages] },
  ];
  const used = runtimeDependencyNames(roots);
  const manualFiles = [...applicationManualLayout.map(({ from, to }) => ({ from, to })), ...publicManuals];
  return {
    exclusions: dependencyExclusions("package-lock.json", used),
    // electron-builder can match a FileSet by its source path rather than by its final archive path.
    unpack: [...new Set([...manuals, ...manualFiles.flatMap(({ from, to }) => [from, to]), `node_modules/${npmLauncher.package}`])]
      .map(path => `${path}/**`),
    physicalInputs: [...manuals, ...manualFiles.map(file => file.to), `node_modules/${npmLauncher.package}/${npmLauncher.entry}`],
    manualFiles,
    roots,
  };
}
