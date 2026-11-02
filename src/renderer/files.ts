import { contentChunkSize } from "../shared/content";
import { openReferencedFile } from "./features/creation/content";
import type { RendererApplicationServices } from "@asterism-app/sdk/renderer";

export const rendererFiles: RendererApplicationServices["files"] = {
  open: openReferencedFile,
  async save(filename, source) {
    const opened = await window.host.saveFile({ type: "begin", filename });
    if (opened.kind !== "opened") throw new Error("Unexpected save response.");
    if (!opened.id) return false;
    const id = opened.id;
    try {
      for await (const bytes of source) for (let offset = 0; offset < bytes.length; offset += contentChunkSize)
        await window.host.saveFile({ type: "write", id, data: Uint8Array.from(bytes.subarray(offset, offset + contentChunkSize)) });
      await window.host.saveFile({ type: "finish", id });
      return true;
    } catch (error) {
      await window.host.saveFile({ type: "abort", id }).catch(() => {});
      throw error;
    }
  },
};
