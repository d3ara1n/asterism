import { readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { artifactDirectory, artifactFile, artifactSchema, type PluginArtifact } from "@asterism-app/plugin-build/artifact";
import { pathWithin } from "../storage/paths.ts";

/** Artifact paths are normalized portable relative paths, never builder-machine paths. */
export function artifactPath(root: string, path: string): string {
  if (!path || path.includes("\\") || path.includes("\0") || path.includes(":") || path.split("/").some(part => !part || part === "." || part === ".."))
    throw new Error(`Invalid artifact path: ${path}.`);
  const file = resolve(root, path);
  if (!pathWithin(root, file)) throw new Error(`Artifact path escapes its root: ${path}.`);
  return file;
}
function existingFile(root: string, path: string): string {
  const file = realpathSync(artifactPath(root, path));
  if (!pathWithin(realpathSync(root), file) || !statSync(file).isFile())
    throw new Error(`Artifact path is not an existing file inside its root: ${path}.`);
  return file;
}
export interface CapturedArtifact { artifact: PluginArtifact; artifactRoot: string }
/** Read the package's artifact descriptor and check its declared files; the output tree is not scanned, hashed, or copied. */
export function captureArtifact(root: string, id: string): CapturedArtifact {
  const artifactRoot = realpathSync(join(root, artifactDirectory));
  const artifact = artifactSchema.parse(JSON.parse(readFileSync(existingFile(artifactRoot, artifactFile), "utf8")));
  if (artifact.id !== id) throw new Error(`Artifact identity ${artifact.id} does not match plugin ${id}.`);
  for (const path of [artifact.runtime, artifact.storage, artifact.renderer, ...Object.values(artifact.public.runtime),
    ...Object.values(artifact.public.renderer), ...artifact.stylesheets]) if (path) existingFile(artifactRoot, path);
  return { artifact, artifactRoot };
}
