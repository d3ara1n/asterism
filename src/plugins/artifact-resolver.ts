import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { artifactSchema, pointerSchema, type PluginArtifact } from "@asterism-app/plugin-build/artifact";
import { pathWithin } from "../storage/paths.ts";

/** Artifact paths are normalized portable relative paths, never builder-machine paths. */
export function artifactPath(root: string, path: string): string {
  if (!path || path.includes("\\") || path.includes("\0") || path.includes(":") || path.split("/").some(part => !part || part === "." || part === ".."))
    throw new Error(`Invalid artifact path: ${path}.`);
  const file = resolve(root, path);
  if (!pathWithin(root, file)) throw new Error(`Artifact path escapes its root: ${path}.`);
  return file;
}
function existingPath(root: string, path: string, directory = false): string {
  const file = realpathSync(artifactPath(root, path));
  if (!pathWithin(realpathSync(root), file) || (directory ? !statSync(file).isDirectory() : !statSync(file).isFile()))
    throw new Error(`Artifact path is not an existing ${directory ? "directory" : "file"} inside its root: ${path}.`);
  return file;
}
export interface CapturedArtifact { artifact: PluginArtifact; artifactRoot: string }
/** Read only the two published descriptors and declared files; immutable build trees are not scanned, hashed, or copied. */
export function captureArtifact(root: string, pointer: string, id: string): CapturedArtifact {
  const pointerFile = existingPath(root, pointer);
  const selection = pointerSchema.parse(JSON.parse(readFileSync(pointerFile, "utf8")));
  const artifactRoot = existingPath(dirname(pointerFile), selection.build, true);
  const artifact = artifactSchema.parse(JSON.parse(readFileSync(existingPath(artifactRoot, "artifact.json"), "utf8")));
  if (artifact.id !== id) throw new Error(`Artifact identity ${artifact.id} does not match plugin ${id}.`);
  for (const path of [artifact.runtime, artifact.storage, artifact.renderer, ...Object.values(artifact.public.runtime),
    ...Object.values(artifact.public.renderer), ...artifact.stylesheets]) if (path) existingPath(artifactRoot, path);
  return { artifact, artifactRoot };
}
