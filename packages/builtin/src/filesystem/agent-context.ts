import { readFile } from "node:fs/promises";
import type { PromptFile } from "@asterism-app/sdk/contracts";

/** Callers resolve the file according to their own scope before reading it. */
export async function readAgentContext(file: string): Promise<PromptFile> {
  const text = await readFile(file, "utf8");
  return { file, text: text.slice(0, 64 * 1024) };
}
