import type { RendererCommand } from "@asterism-app/sdk/renderer";

function validateLevel(commands: readonly RendererCommand[]): void {
  const ids = new Set<string>();
  for (const command of commands) {
    if (!command.id.trim() || command.id !== command.id.trim() || ids.has(command.id))
      throw new Error("Command IDs must be unique non-empty trimmed strings among siblings.");
    ids.add(command.id);
  }
}

/** Resolve the current contribution tree by identity, preserving ancestor availability during asynchronous work. */
export function resolveCommandPage(commands: readonly RendererCommand[], path: readonly string[]) {
  let parent: RendererCommand | undefined;
  let disabled = false;
  validateLevel(commands);
  for (const id of path) {
    parent = commands.find(command => command.id === id && command.when !== false);
    if (!parent?.children) return null;
    disabled ||= parent.disabled === true;
    commands = parent.children;
    validateLevel(commands);
  }
  return { commands, parent, disabled };
}
