import { createHash } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ModelFilePart, ModelInputPart, ModelItem, ModelMediaModality } from "@asterism-app/sdk/contracts";
import type { ContentReader, PluginContext } from "@asterism-app/sdk/runtime";
import { saveFileContent } from "../filesystem/save.ts";
import { modelMediaModality, MAX_INLINE_FILE_BYTES } from "../shared/model-media.ts";

const key = (value: string) => createHash("sha256").update(value).digest("hex");
const safeName = (name: string) => name.split(/[\\/]/u).at(-1)?.replace(/[<>:"|?*\x00-\x1f]/gu, "_").replace(/^[. ]+|[. ]+$/gu, "").slice(-60) || "attachment";
const escapeText = (text: string) => text.replace(/[&<>]/gu, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[value]!);
const attachmentText = (metadata: object) => ({ kind: "text" as const, text: `<attachment>${escapeText(JSON.stringify(metadata))}</attachment>` });

/** Derived working files carry a stable path while the original remains in the authorized content store. */
export function createAttachmentProjection(root: string, log?: Pick<PluginContext["log"], "error">) {
  return async (messages: readonly ModelItem[], sessionId: string, content: ContentReader,
    modalities: readonly ModelMediaModality[], signal: AbortSignal): Promise<ModelItem[]> => {
    const sessionRoot = join(root, key(sessionId));
    const sizes = new Map<string, number>();
    const sizeOf = async (part: ModelFilePart): Promise<number> => {
      const id = part.file["$asterism.content"];
      const cached = sizes.get(id);
      if (cached !== undefined) return cached;
      let size = content.size?.(part.file) ?? part.size;
      if (size === undefined) {
        size = 0;
        for await (const bytes of content.open(part.file)) {
          signal.throwIfAborted();
          size += bytes.length;
          if (size > MAX_INLINE_FILE_BYTES) break;
        }
      }
      sizes.set(id, size);
      return size;
    };
    const projectFile = async (part: ModelFilePart, toolResult: boolean): Promise<ModelInputPart> => {
      signal.throwIfAborted();
      const filename = part.filename ?? "attachment";
      const mediaType = part.mediaType;
      const modality = modelMediaModality(mediaType, toolResult);
      let reason = modality === undefined ? "This media type is not sent as native input by the Agent."
        : !modalities.includes(modality) ? `The current model is not configured for ${modality} input.` : undefined;
      let size = part.size;
      let phase: "size" | "copy" = "size";
      if (toolResult && reason) return attachmentText({ filename, mediaType, size, reason });
      try {
        const measured = await sizeOf(part);
        if (!reason && measured <= MAX_INLINE_FILE_BYTES) return part;
        reason ??= "The file exceeds the 8 MiB native input limit.";
        // A streaming size probe can stop at the limit rather than report the full length.
        if (content.size || measured <= MAX_INLINE_FILE_BYTES) size = measured;
        if (toolResult) return attachmentText({ filename, mediaType, size, reason });
        phase = "copy";
        const id = part.file["$asterism.content"];
        const path = join(sessionRoot, key(id), `file-${safeName(filename)}`);
        const existing = await stat(path).catch(error => {
          if (error.code !== "ENOENT") throw error;
          return null;
        });
        if (!existing?.isFile() || existing.size !== size) {
          await mkdir(sessionRoot, { recursive: true, mode: 0o700 });
          size = await saveFileContent(path, content.open(part.file), signal);
          sizes.set(id, size);
        }
        return attachmentText({ filename, mediaType, size, reason, path });
      } catch (error) {
        signal.throwIfAborted();
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        const message = phase === "size" ? "The attachment size could not be read from the content store."
          : code === "ENOSPC" ? "There is not enough disk space to prepare a local copy of the attachment."
          : "A local copy of the attachment could not be prepared.";
        log?.error(message, error);
        return attachmentText({ filename, mediaType, size, reason, error: message });
      }
    };
    const output: ModelItem[] = [];
    for (const item of messages) {
      if (item.kind === "output") { output.push(item); continue; }
      const toolResult = item.kind === "result";
      const parts: ModelInputPart[] = [];
      for (const part of toolResult ? item.outcome.model : item.parts)
        parts.push(part.kind === "file" ? await projectFile(part, toolResult) : part);
      output.push(toolResult ? { ...item, outcome: { ...item.outcome, model: parts } } : { ...item, parts });
    }
    return output;
  };
}

export function agentAttachmentProjection(plugin: PluginContext) {
  const root = join(plugin.cacheDir, "attachments");
  // Session expiry happens at startup. Only remove derived data for absent sessions, not live tool paths.
  const retained = new Set([...plugin.sessions.list(), ...plugin.sessions.sleeping(), ...plugin.sessions.archived()].map(session => key(session.id)));
  const ready = readdir(root, { withFileTypes: true }).then(async entries => {
    for (const entry of entries) if (entry.isDirectory() && /^[a-f0-9]{64}$/u.test(entry.name) && !retained.has(entry.name))
      await rm(join(root, entry.name), { recursive: true, force: true });
  }).catch(error => { if (error.code !== "ENOENT") plugin.log.warn("Could not clean the attachment cache."); });
  plugin.lifetime.defer(() => ready);
  const project = createAttachmentProjection(root, plugin.log);
  return async (...args: Parameters<typeof project>) => { await ready; return project(...args); };
}
