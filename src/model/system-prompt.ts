import type { SystemPrompt } from "@asterism-app/sdk/contracts";

/** Providers receive the caller's ordered prompt bodies verbatim. */
export function projectSystemPrompt(prompt: SystemPrompt): string {
  return prompt.blocks.map(block => block.text).join("\n\n");
}
