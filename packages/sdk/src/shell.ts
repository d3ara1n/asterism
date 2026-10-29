import { z } from "zod";
import { defineCall } from "./calls.ts";
import { defineData } from "./presentation.ts";

export const OUTPUT_CHAR_LIMIT = 16_384;
export const MAX_TIMEOUT_SECONDS = 2_147_483_647 / 1000;

/** Startup arguments and command arguments are separate, allowing a profile to be shared across different shell usage modes. */
export const shellProfileSchema = z.strictObject({
  id: z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u).refine(value => value !== "auto", "The profile ID 'auto' is reserved."),
  executable: z.string().trim().min(1),
  args: z.array(z.string()),
  commandArgs: z.array(z.string()),
  env: z.record(z.string(), z.string()),
});
export type ShellProfile = z.infer<typeof shellProfileSchema>;

export const shellPresets: ShellProfile[] = [
  { id: "pwsh", executable: "pwsh", args: [], commandArgs: ["-NonInteractive", "-Command"], env: {} },
  { id: "nu", executable: "nu", args: ["-l"], commandArgs: ["-c"], env: {} },
  { id: "fish", executable: "fish", args: [], commandArgs: ["-c"], env: {} },
  { id: "zsh", executable: "zsh", args: [], commandArgs: ["-c"], env: {} },
  { id: "bash", executable: "bash", args: [], commandArgs: ["-c"], env: {} },
  { id: "sh", executable: "sh", args: [], commandArgs: ["-c"], env: {} },
];
export const defaultShellSettings = { selected: "auto", profiles: shellPresets };
export const shellSettingsSchema = z.strictObject({
  selected: z.string().min(1),
  profiles: z.array(shellProfileSchema),
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  value.profiles.forEach((profile, index) => {
    if (ids.has(profile.id)) ctx.addIssue({ code: "custom", path: ["profiles", index, "id"], message: "Shell profile IDs must be unique." });
    ids.add(profile.id);
  });
  if (value.selected !== "auto" && !ids.has(value.selected))
    ctx.addIssue({ code: "custom", path: ["selected"], message: "Select an existing shell profile or auto." });
});
export type ShellSettings = z.infer<typeof shellSettingsSchema>;
export const TerminalProfilesCatalog = defineData("asterism.shell/profiles", shellSettingsSchema);

export const shellProfileListSchema = z.strictObject({
  selected: z.string(),
  resolvedProfile: z.string().nullable(),
  profiles: z.array(z.strictObject({
    id: z.string(),
    executable: z.string(),
    args: z.array(z.string()),
    commandArgs: z.array(z.string()),
    available: z.boolean(),
    resolvedExecutable: z.string().nullable(),
  })),
});
export type ShellProfileList = z.infer<typeof shellProfileListSchema>;

export const shellOutputSchema = z.strictObject({
  output: z.string(),
  truncation: z.strictObject({
    totalChars: z.number().int().nonnegative(),
    retainedChars: z.number().int().nonnegative(),
    file: z.string(),
  }).nullable(),
});
export type ShellOutput = z.infer<typeof shellOutputSchema>;
export const execResultSchema = shellOutputSchema.extend({
  shell: z.string(),
  termination: z.enum(["running", "exited", "timeout", "cancelled", "spawn_error", "io_error"]),
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  durationMs: z.number().nonnegative(),
});
export type ExecResult = z.infer<typeof execResultSchema>;

export const ReadShellProfiles = defineCall("core.shell.profiles.read", {
  scope: "plugin", input: z.strictObject({}), output: shellProfileListSchema,
});
