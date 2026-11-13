import { mkdirSync } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { implementCreation, PluginApiError } from "@asterism-app/sdk/runtime";
import { CreateDirectory } from "./contract.ts";
import { filesystemFailure } from "./errors.ts";
import { resolveLocalPath } from "./local-path.ts";

export const directoryCreation = implementCreation(CreateDirectory, {
  async prepare(input, { signal }) {
    signal.throwIfAborted();
    try {
      const path = resolveLocalPath(input.path);
      if (input.mode === "existing" && !(await stat(path)).isDirectory())
        throw new PluginApiError("invalid_argument", "The path is not an existing directory.");
      return { action: "replace", input: { ...input, path } };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof PluginApiError) throw error;
      const failure = filesystemFailure(error, "Open directory");
      throw new PluginApiError("invalid_argument", failure.error.message, failure.error.code);
    }
  },
  create({ path, title, mode }) {
    // Creation callbacks commit synchronously; mkdir runs here so preparation stays read-only.
    if (mode === "new") {
      try { mkdirSync(path); }
      catch (error) {
        const failure = filesystemFailure(error, "Create project directory");
        const message = failure.error.code === "path_not_found"
          ? "Create project directory: The parent directory is missing or contains a broken symbolic link." : failure.error.message;
        throw new PluginApiError("rejected", message, failure.error.code);
      }
    }
    return { title: title ?? (basename(path) || path), data: { path } };
  },
});
