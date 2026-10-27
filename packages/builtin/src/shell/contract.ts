import { z } from "zod";
import { builtin, configurationIdSchema } from "@asterism/builtin-api/contracts";

export const OUTPUT_CHAR_LIMIT = 16_384;
export const MAX_TIMEOUT_SECONDS = 2_147_483_647 / 1000;

/** Startup arguments and command arguments are separate, allowing a profile to be shared across different shell usage modes. */
export const shellProfileSchema = z.strictObject({
  id: configurationIdSchema.refine(value => value !== "auto", "The profile ID 'auto' is reserved."),
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

export const ShellProfileListResult = builtin.data("shell.profile-list", z.strictObject({
  selected: z.string().describe("Default profile ID, or 'auto' for the first available profile in platform preference order."),
  resolvedProfile: z.string().nullable().describe("Profile ID currently resolved for the default selection; null when its executable is unavailable."),
  profiles: z.array(z.strictObject({
    id: z.string().describe("Profile ID accepted by terminal creation."),
    executable: z.string().describe("Configured executable path or command name."),
    args: z.array(z.string()).describe("Configured shell startup arguments."),
    commandArgs: z.array(z.string()).describe("Arguments added before command text for directory exec."),
    available: z.boolean().describe("Whether an executable file was found using this profile's environment."),
    resolvedExecutable: z.string().nullable().describe("Resolved absolute executable path, or null when unavailable."),
  })).describe("Configured profiles in settings order, including unavailable executables."),
}).describe("Shared shell profiles for directory exec and terminal creation. Availability reflects executable discovery at query time."));
export type ShellProfileList = z.infer<typeof ShellProfileListResult.schema>;

export const shellOutputSchema = z.strictObject({
  output: z.string().describe(`Processed output, retaining at most the last ${OUTPUT_CHAR_LIMIT} Unicode characters.`),
  truncation: z.strictObject({
    totalChars: z.number().int().nonnegative(),
    retainedChars: z.number().int().nonnegative(),
    file: z.string().describe("Absolute path to the temporary full output log."),
  }).nullable().describe("Output truncation metadata, or null for complete output."),
});
export type ShellOutput = z.infer<typeof shellOutputSchema>;
export const execResultSchema = shellOutputSchema.extend({
  shell: z.string().describe("The executable selected for this invocation."),
  termination: z.enum(["running", "exited", "timeout", "cancelled", "spawn_error", "io_error"]),
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  durationMs: z.number().nonnegative(),
}).describe("Processed shell output, optional temporary log location and execution status.");
export type ExecResult = z.infer<typeof execResultSchema>;

/** The model consumes output text and truncation notices; the UI shows execution information, and the shared tool layer generates explanations for unsuccessful outcomes. */
export function execToModel(data: ExecResult): string {
  const notice = data.truncation
    ? `\n\n[Output truncated: showing the last ${data.truncation.retainedChars} of ${data.truncation.totalChars} Unicode characters. Full output: ${data.truncation.file}]`
    : "";
  return data.output + notice;
}
