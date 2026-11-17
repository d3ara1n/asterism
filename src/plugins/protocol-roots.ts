import { artifactRoots } from "./native-modules.ts";
import { readPluginBuild } from "./artifacts.ts";

let roots: Readonly<Record<string, string>> = {};
/** Main receives only preparation's captured paths, never reselects a package's latest pointer. */
export function capturePluginArtifactRoots(pluginBuild: string): void {
  roots = artifactRoots(readPluginBuild(pluginBuild));
}
export function pluginArtifactRoot(key: string): string | undefined { return roots[key]; }
