import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import type { ResolvedShell } from "../shell/profiles.ts";

/** 集成只报告前台执行边界，命令编辑和程序交互仍由 shell 自己处理。 */
export async function prepareInteractiveShell(shell: ResolvedShell, root: string, token: string) {
  const kind = basename(shell.executable).replace(/\.exe$/i, "").toLowerCase();
  const env = { ...shell.env, TERM: "xterm-256color", TERM_PROGRAM: "Atelier", COLORTERM: "truecolor" };
  const args = [...shell.profile.args];
  const supported = ["zsh", "bash", "pwsh", "powershell"].includes(kind);
  if (!supported) return { args, env, supported, cleanup: async () => {} };
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, "shell-"));
  const mark = (state: string) => `printf '\\033]777;atelier;${token};${state}\\007'`;
  try {
    if (kind === "zsh") {
      const original = shell.env.ZDOTDIR || shell.env.HOME || homedir();
      Object.assign(env, { ATELIER_ZDOTDIR: original, ZDOTDIR: dir });
      await writeFile(join(dir, ".zshenv"), '[[ -f "$ATELIER_ZDOTDIR/.zshenv" ]] && source "$ATELIER_ZDOTDIR/.zshenv"\nZDOTDIR=' + quote(dir) + '\n');
      await writeFile(join(dir, ".zprofile"), '[[ -f "$ATELIER_ZDOTDIR/.zprofile" ]] && source "$ATELIER_ZDOTDIR/.zprofile"\nZDOTDIR=' + quote(dir) + '\n');
      await writeFile(join(dir, ".zshrc"), `ZDOTDIR="$ATELIER_ZDOTDIR"
[[ -f "$ZDOTDIR/.zshrc" ]] && source "$ZDOTDIR/.zshrc"
autoload -Uz add-zsh-hook
_atelier_preexec() { ${mark("running")}; }
_atelier_precmd() { ${mark("idle")}; }
add-zsh-hook preexec _atelier_preexec
add-zsh-hook precmd _atelier_precmd
`);
      args.push("-i");
    } else if (kind === "bash") {
      const rc = join(dir, "bashrc");
      await writeFile(rc, `[[ -f ~/.bashrc ]] && source ~/.bashrc
_atelier_ready=0
_atelier_prompt() { ${mark("idle")}; _atelier_ready=1; }
# DEBUG 同时覆盖 macOS 自带的 Bash 3.2；保留用户已有 DEBUG handler。
_atelier_previous_debug=$(trap -p DEBUG)
_atelier_previous_debug=\${_atelier_previous_debug#trap -- }
_atelier_previous_debug=\${_atelier_previous_debug% DEBUG}
if [[ -n "$_atelier_previous_debug" ]]; then eval "_atelier_previous_debug=$_atelier_previous_debug"; fi
_atelier_debug() {
  if [[ "\${_atelier_ready:-0}" == 1 && "$1" != _atelier_prompt && "$1" != "_atelier_prompt;" ]]; then
    _atelier_ready=0
    ${mark("running")}
  fi
  if [[ -n "$_atelier_previous_debug" ]]; then eval "$_atelier_previous_debug"; fi
}
trap '_atelier_debug "$BASH_COMMAND"' DEBUG
if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
  PROMPT_COMMAND+=(_atelier_prompt)
else
  PROMPT_COMMAND="\${PROMPT_COMMAND:+$PROMPT_COMMAND; }_atelier_prompt"
fi
`);
      args.push("--rcfile", rc, "-i");
    } else {
      const file = join(dir, "integration.ps1");
      await writeFile(file, `Import-Module PSReadLine -ErrorAction SilentlyContinue
$global:AtelierOriginalPrompt = $function:prompt
function global:prompt {
  [Console]::Write("$([char]27)]777;atelier;${token};idle$([char]7)")
  if ($global:AtelierOriginalPrompt) { & $global:AtelierOriginalPrompt } else { "PS $($executionContext.SessionState.Path.CurrentLocation)> " }
}
if (Get-Module PSReadLine) {
  $global:AtelierOriginalHistoryHandler = (Get-PSReadLineOption).AddToHistoryHandler
  Set-PSReadLineOption -AddToHistoryHandler {
    param($line)
    [Console]::Write("$([char]27)]777;atelier;${token};running$([char]7)")
    if ($global:AtelierOriginalHistoryHandler) { return $global:AtelierOriginalHistoryHandler.Invoke($line) }
    return $true
  }
}
`);
      args.push("-NoExit", "-Command", `. '${file.replaceAll("'", "''")}'`);
    }
    return { args, env, supported, cleanup: () => rm(dir, { recursive: true, force: true }) };
  } catch (error) { await rm(dir, { recursive: true, force: true }); throw error; }
}
function quote(value: string) { return `'${value.replaceAll("'", "'\\''")}'`; }
