import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ResolvedShell } from "../shell/profiles.ts";

/**
 * Shell 集成适配：集成只报告提示符、执行边界、退出码与当前目录（OSC 133／633 语义），命令编辑仍由 shell 处理。
 * 脚本内容固定，所有终端共用；实例 nonce 经环境变量传入，脚本读取后立即 unset。
 */
export type IntegrationMode = "injected" | "native" | "none";
export interface ShellLaunch { args: string[]; env: Record<string, string>; mode: IntegrationMode }

const mark = (body: string) => `printf '\\033]${body}\\007'`;
const zshFiles = {
  ".zshenv": `ATELIER_INTEGRATION_DIR="$ZDOTDIR"
if [[ -n "\${ATELIER_USER_ZDOTDIR-}" ]]; then ZDOTDIR="$ATELIER_USER_ZDOTDIR"; else ZDOTDIR="$HOME"; _atelier_zdotdir_default=1; fi
[[ -f "$ZDOTDIR/.zshenv" ]] && source "$ZDOTDIR/.zshenv"
# 用户 .zshenv 可改写 ZDOTDIR（XDG 布局）；之后的启动文件从它读取。
ATELIER_USER_ZDOTDIR="$ZDOTDIR"
ZDOTDIR="$ATELIER_INTEGRATION_DIR"
`,
  ".zprofile": `ZDOTDIR="$ATELIER_USER_ZDOTDIR"
[[ -f "$ZDOTDIR/.zprofile" ]] && source "$ZDOTDIR/.zprofile"
ATELIER_USER_ZDOTDIR="$ZDOTDIR"
ZDOTDIR="$ATELIER_INTEGRATION_DIR"
`,
  ".zshrc": `ZDOTDIR="$ATELIER_USER_ZDOTDIR"
[[ -f "$ZDOTDIR/.zshrc" ]] && source "$ZDOTDIR/.zshrc"
ATELIER_USER_ZDOTDIR="$ZDOTDIR"
if [[ -o login ]]; then ZDOTDIR="$ATELIER_INTEGRATION_DIR"; else source "$ATELIER_INTEGRATION_DIR/integration.zsh"; fi
`,
  ".zlogin": `ZDOTDIR="$ATELIER_USER_ZDOTDIR"
[[ -f "$ZDOTDIR/.zlogin" ]] && source "$ZDOTDIR/.zlogin"
ATELIER_USER_ZDOTDIR="$ZDOTDIR"
source "$ATELIER_INTEGRATION_DIR/integration.zsh"
`,
  "integration.zsh": `ZDOTDIR="$ATELIER_USER_ZDOTDIR"
if [[ -n "\${_atelier_zdotdir_default-}" && "$ZDOTDIR" == "$HOME" ]]; then unset ZDOTDIR; fi
typeset -g _atelier_nonce="$ATELIER_NONCE" _atelier_ran=0
unset ATELIER_NONCE ATELIER_LOGIN ATELIER_USER_ZDOTDIR ATELIER_INTEGRATION_DIR _atelier_zdotdir_default
_atelier_precmd() {
  local code=$?
  if (( _atelier_ran )); then ${mark('133;D;%s;%s')} "$code" "$_atelier_nonce"; fi
  _atelier_ran=0
  ${mark('633;P;%s;Cwd=%s')} "$_atelier_nonce" "$PWD"
  ${mark('133;A;%s')} "$_atelier_nonce"
}
_atelier_preexec() {
  _atelier_ran=1
  ${mark('133;C;%s')} "$_atelier_nonce"
}
# 首位 precmd 读取的 $? 才是前台命令的退出码。
precmd_functions=(_atelier_precmd "\${precmd_functions[@]}")
preexec_functions+=(_atelier_preexec)
`,
};
const bashRc = `_atelier_nonce="$ATELIER_NONCE"
_atelier_login="$ATELIER_LOGIN"
unset ATELIER_NONCE ATELIER_LOGIN
# bash 登录模式会忽略 --rcfile；由此脚本按登录 shell 的顺序读取启动文件。
if [[ "$_atelier_login" == 1 ]]; then
  [[ -r /etc/profile ]] && source /etc/profile
  if [[ -r ~/.bash_profile ]]; then source ~/.bash_profile
  elif [[ -r ~/.bash_login ]]; then source ~/.bash_login
  elif [[ -r ~/.profile ]]; then source ~/.profile
  fi
else
  [[ -r ~/.bashrc ]] && source ~/.bashrc
fi
unset _atelier_login
_atelier_ran=0
_atelier_ready=0
if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
  _atelier_user_prompt=""
  for _atelier_item in "\${PROMPT_COMMAND[@]}"; do _atelier_user_prompt="\${_atelier_user_prompt:+$_atelier_user_prompt
}$_atelier_item"; done
  unset _atelier_item
else
  _atelier_user_prompt="\${PROMPT_COMMAND-}"
fi
_atelier_status() { return "$1"; }
_atelier_prompt() {
  local code=$?
  if [[ "$_atelier_ran" == 1 ]]; then ${mark('133;D;%s;%s')} "$code" "$_atelier_nonce"; fi
  _atelier_ran=0
  if [[ -n "$_atelier_user_prompt" ]]; then _atelier_status "$code"; eval "$_atelier_user_prompt"; fi
  ${mark('633;P;%s;Cwd=%s')} "$_atelier_nonce" "$PWD"
  ${mark('133;A;%s')} "$_atelier_nonce"
  _atelier_ready=1
}
# DEBUG 同时覆盖 macOS 自带的 Bash 3.2；保留用户已有 DEBUG handler。
_atelier_previous_debug=$(trap -p DEBUG)
_atelier_previous_debug=\${_atelier_previous_debug#trap -- }
_atelier_previous_debug=\${_atelier_previous_debug% DEBUG}
if [[ -n "$_atelier_previous_debug" ]]; then eval "_atelier_previous_debug=$_atelier_previous_debug"; fi
_atelier_debug() {
  if [[ "$_atelier_ready" == 1 && "$1" != _atelier_prompt* ]]; then
    _atelier_ready=0; _atelier_ran=1
    ${mark('133;C;%s')} "$_atelier_nonce"
  fi
  if [[ -n "$_atelier_previous_debug" ]]; then eval "$_atelier_previous_debug"; fi
}
trap '_atelier_debug "$BASH_COMMAND"' DEBUG
unset PROMPT_COMMAND
PROMPT_COMMAND=_atelier_prompt
`;
const pwshScript = `$global:__AtelierNonce = $env:ATELIER_NONCE
Remove-Item Env:ATELIER_NONCE -ErrorAction SilentlyContinue
Remove-Item Env:ATELIER_LOGIN -ErrorAction SilentlyContinue
$global:__AtelierRan = $false
Import-Module PSReadLine -ErrorAction SilentlyContinue
$global:__AtelierOriginalPrompt = $function:prompt
function global:prompt {
  $ok = $global:?
  $exit = $global:LASTEXITCODE
  $e = [char]27; $b = [char]7; $n = $global:__AtelierNonce
  $marks = ""
  if ($global:__AtelierRan) {
    $code = if ($ok) { 0 } elseif ($exit) { $exit } else { 1 }
    $marks += "$e]133;D;$code;$n$b"
  }
  $global:__AtelierRan = $false
  $marks += "$e]633;P;$n;Cwd=$($executionContext.SessionState.Path.CurrentLocation.ProviderPath)$b$e]133;A;$n$b"
  $text = if ($global:__AtelierOriginalPrompt) { & $global:__AtelierOriginalPrompt } else { "PS $($executionContext.SessionState.Path.CurrentLocation)> " }
  $global:LASTEXITCODE = $exit
  return $marks + $text
}
if (Get-Module PSReadLine) {
  $global:__AtelierHistory = (Get-PSReadLineOption).AddToHistoryHandler
  Set-PSReadLineOption -AddToHistoryHandler {
    param([string]$line)
    $global:__AtelierRan = $true
    [Console]::Write("$([char]27)]133;C;$($global:__AtelierNonce)$([char]7)")
    if ($global:__AtelierHistory) { return $global:__AtelierHistory.Invoke($line) }
    return $true
  }
}
`;

const written = new Map<string, Promise<string>>();
/** 每次运行写入一次固定脚本，覆盖旧版本内容；返回集成目录。 */
export function ensureIntegration(root: string): Promise<string> {
  let pending = written.get(root);
  if (!pending) {
    pending = (async () => {
      const zsh = join(root, "zsh");
      await mkdir(zsh, { recursive: true });
      await Promise.all([
        ...Object.entries(zshFiles).map(([name, content]) => writeFile(join(zsh, name), content)),
        writeFile(join(root, "bashrc"), bashRc),
        writeFile(join(root, "integration.ps1"), pwshScript),
      ]);
      return root;
    })();
    pending.catch(() => written.delete(root));
    written.set(root, pending);
  }
  return pending;
}

const loginFlags = ["-l", "--login", "-Login", "-login"];
/** 按 shell 种类构造启动参数与环境；macOS 默认登录 shell，与系统终端一致。 */
export async function prepareLaunch(shell: ResolvedShell, root: string, nonce: string, platform: NodeJS.Platform = process.platform): Promise<ShellLaunch> {
  const kind = basename(shell.executable).replace(/\.exe$/i, "").toLowerCase();
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(shell.env)) if (value !== undefined) env[key] = value;
  Object.assign(env, { TERM: "xterm-256color", TERM_PROGRAM: "Atelier", COLORTERM: "truecolor" });
  const requested = shell.profile.args.some(arg => loginFlags.includes(arg));
  const login = requested || platform === "darwin";
  const others = shell.profile.args.filter(arg => !loginFlags.includes(arg));
  if (kind === "zsh") {
    const dir = join(await ensureIntegration(root), "zsh");
    if (env.ZDOTDIR) env.ATELIER_USER_ZDOTDIR = env.ZDOTDIR; else delete env.ATELIER_USER_ZDOTDIR;
    Object.assign(env, { ZDOTDIR: dir, ATELIER_NONCE: nonce });
    return { args: [...login ? ["-l"] : [], "-i", ...others.filter(arg => arg !== "-i")], env, mode: "injected" };
  }
  if (kind === "bash") {
    const rc = join(await ensureIntegration(root), "bashrc");
    Object.assign(env, { ATELIER_NONCE: nonce, ATELIER_LOGIN: login ? "1" : "0" });
    // 长选项须在单字符选项之前；登录模式由脚本模拟。
    return { args: ["--rcfile", rc, ...others.filter(arg => arg !== "-i"), "-i"], env, mode: "injected" };
  }
  if (kind === "pwsh" || kind === "powershell") {
    const script = join(await ensureIntegration(root), "integration.ps1");
    env.ATELIER_NONCE = nonce;
    const loginArgs = kind === "pwsh" && platform !== "win32" && login ? ["-Login"] : [];
    return { args: [...loginArgs, ...others, "-NoExit", "-Command", `. '${script.replaceAll("'", "''")}'`], env, mode: "injected" };
  }
  if (kind === "fish" || kind === "nu") {
    // 两者自带 OSC 133；不注入脚本。
    return { args: [...login && platform !== "win32" ? ["-l"] : [], ...others], env, mode: "native" };
  }
  return { args: shell.profile.args, env, mode: "none" };
}
