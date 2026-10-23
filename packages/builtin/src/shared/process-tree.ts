import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
/** 父进程退出前取得后代快照，退出后进程表的父子关系会丢失。 */
export async function descendantsOf(root: number): Promise<number[]> {
  const { stdout } = await execute("ps", ["-axo", "pid=,ppid="]);
  const children = new Map<number, number[]>();
  for (const line of stdout.trim().split("\n")) {
    const [pid, parent] = line.trim().split(/\s+/u).map(Number);
    if (pid && parent) children.set(parent, [...children.get(parent) ?? [], pid]);
  }
  const walk = (pid: number): number[] => (children.get(pid) ?? []).flatMap(child => [...walk(child), child]);
  return walk(root);
}

/** SDK 负责直接子进程的协议关闭，模块补齐包装命令留下的后代清理。 */
export async function closeProcessTree(pid: number | null, close: () => Promise<void>): Promise<void> {
  if (!pid) return close();
  if (process.platform === "win32") {
    try { await execute("taskkill", ["/PID", String(pid), "/T", "/F"]); }
    finally { await close(); }
    return;
  }
  let descendants: number[] = [];
  try { descendants = await descendantsOf(pid); }
  finally {
    try { await close(); }
    finally {
      for (const child of descendants) {
        try { process.kill(child, "SIGKILL"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      }
    }
  }
}
