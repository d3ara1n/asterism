import { z } from "zod";

export const OUTPUT_CHAR_LIMIT = 16_384;
export const MAX_TIMEOUT_SECONDS = 2_147_483_647 / 1000;

/** 启动参数与命令参数分开，profile 可供不同 shell 使用方式共享。 */
export const shellProfileSchema = z.strictObject({
  id: z.string().trim().min(1).refine(value => value !== "auto", "The profile ID 'auto' is reserved."),
  name: z.string().trim().min(1),
  executable: z.string().trim().min(1),
  args: z.array(z.string()),
  commandArgs: z.array(z.string()),
  env: z.record(z.string(), z.string()),
});
export type ShellProfile = z.infer<typeof shellProfileSchema>;

export const shellPresets: ShellProfile[] = [
  { id: "pwsh", name: "PowerShell 7", executable: "pwsh", args: [], commandArgs: ["-NonInteractive", "-Command"], env: {} },
  { id: "nu", name: "Nushell", executable: "nu", args: ["-l"], commandArgs: ["-c"], env: {} },
  { id: "fish", name: "Fish", executable: "fish", args: [], commandArgs: ["-c"], env: {} },
  { id: "zsh", name: "Zsh", executable: "zsh", args: [], commandArgs: ["-c"], env: {} },
  { id: "bash", name: "Bash", executable: "bash", args: [], commandArgs: ["-c"], env: {} },
  { id: "sh", name: "POSIX sh", executable: "sh", args: [], commandArgs: ["-c"], env: {} },
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

/** 模型消费输出正文与截断提示；执行信息由 UI 展示，非成功说明由公共工具层生成。 */
export function execToModel(data: ExecResult): string {
  const notice = data.truncation
    ? `\n\n[Output truncated: showing the last ${data.truncation.retainedChars} of ${data.truncation.totalChars} Unicode characters. Full output: ${data.truncation.file}]`
    : "";
  return data.output + notice;
}
