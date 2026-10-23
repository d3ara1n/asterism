import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** 进程表的 pid／ppid 对；Windows 经 CIM 查询，其余平台用 ps。 */
async function processTable(): Promise<string> {
  if (process.platform === "win32") {
    const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const { stdout } = await execute(powershell, ["-NoProfile", "-NonInteractive", "-Command",
      "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId)\" }"], { windowsHide: true });
    return stdout;
  }
  const { stdout } = await execute("ps", ["-axo", "pid=,ppid="]);
  return stdout;
}

/** 由 pid／ppid 文本求 root 的全部后代，深层后代排在其父进程之前。 */
export function descendantsIn(table: string, root: number): number[] {
  const children = new Map<number, number[]>();
  for (const line of table.trim().split(/\r?\n/u)) {
    const [pid, parent] = line.trim().split(/\s+/u).map(Number);
    if (pid && parent && pid !== parent) children.set(parent, [...children.get(parent) ?? [], pid]);
  }
  const seen = new Set<number>([root]);
  const walk = (pid: number): number[] => (children.get(pid) ?? []).filter(child => !seen.has(child) && seen.add(child))
    .flatMap(child => [...walk(child), child]);
  return walk(root);
}

/** 父进程退出前取得后代快照，退出后进程表的父子关系会丢失。 */
export async function descendantsOf(root: number): Promise<number[]> {
  return descendantsIn(await processTable(), root);
}

/**
 * 先取后代快照，再由调用方优雅关闭直接子进程，最后强制结束仍存活的后代。
 * 包装命令（npx、uvx、shell 脚本）的实际服务器常是孙进程，直接子进程退出不会带走它们。
 */
export async function closeProcessTree(pid: number | null, close: () => Promise<void>): Promise<void> {
  if (!pid) return close();
  const descendants = await descendantsOf(pid).catch(() => []);
  try { await close(); }
  finally {
    for (const child of descendants) {
      try { process.kill(child, "SIGKILL"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
  }
}
