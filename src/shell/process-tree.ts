import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** pid/ppid pairs from the process table; queried through CIM on Windows and ps on other platforms. */
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

/** Finds all descendants of root from pid/ppid text, ordering deeper descendants before their parents. */
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

/** Captures descendants before the parent exits, since the process table loses parent-child relationships after exit. */
export async function descendantsOf(root: number): Promise<number[]> {
  return descendantsIn(await processTable(), root);
}

/**
 * Capture descendants first, then let the caller gracefully close the direct child, and finally force termination of surviving descendants.
 * Actual servers behind wrapper commands (npx, uvx, shell scripts) are often grandchildren and survive the direct child's exit.
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
