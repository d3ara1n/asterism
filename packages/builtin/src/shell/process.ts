import { spawn } from "node:child_process";
import { join } from "node:path";

export interface ProcessExit { exitCode: number | null; signal: string | null; error: string | null }
export interface ShellProcess {
  /** 退出与输出收尾分别观察，等待本身不终止进程。 */
  exited: Promise<ProcessExit>;
  settled: Promise<ProcessExit>;
  stop(): Promise<void>;
}

async function killProcessGroup(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const killer = spawn(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
        ["/F", "/T", "/PID", String(pid)], { windowsHide: true, stdio: "ignore" });
      killer.once("error", reject);
      killer.once("exit", code => code === 0 || code === 128 ? resolve() : reject(new Error(`taskkill exited with code ${code}.`)));
    });
    return;
  }
  try { process.kill(-pid, "SIGKILL"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

/** 管道后端；拥有进程及 IO 生命周期，调用方决定何时 stop。 */
export function startShellProcess(executable: string, args: string[], options: {
  cwd: string; env: NodeJS.ProcessEnv;
  onData(stream: "stdout" | "stderr", bytes: Buffer): Promise<void>;
}): ShellProcess {
  const child = spawn(executable, args, {
    cwd: options.cwd, env: options.env, detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let resolveExit!: (exit: ProcessExit) => void, resolveSettled!: (exit: ProcessExit) => void;
  const exited = new Promise<ProcessExit>(resolve => { resolveExit = resolve; });
  const settled = new Promise<ProcessExit>(resolve => { resolveSettled = resolve; });
  let exit: ProcessExit | null = null, done = false, pending = 0;
  let ioError: string | null = null;
  let queue = Promise.resolve();
  let idle: ReturnType<typeof setTimeout> | undefined;
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= child.pid && !exit
    ? killProcessGroup(child.pid) : Promise.resolve();
  const finish = () => {
    if (done || !exit) return;
    done = true;
    clearTimeout(idle);
    child.stdout.destroy(); child.stderr.destroy();
    void queue.then(() => resolveSettled({ ...exit!, error: ioError ?? exit!.error }));
  };
  // 主进程退出后，空闲的继承管道不会永久阻塞；背压中的数据先完成消费。
  const armIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (pending || child.stdout.readableLength || child.stderr.readableLength) armIdle();
      else finish();
    }, 100);
  };
  for (const stream of ["stdout", "stderr"] as const) {
    child[stream].on("data", (bytes: Buffer) => {
      child.stdout.pause(); child.stderr.pause(); pending++;
      if (exit) armIdle();
      queue = queue.then(() => ioError ? undefined : options.onData(stream, bytes)).catch(async error => {
        ioError = error instanceof Error ? error.message : String(error);
        try { await stop(); } catch (failure) { ioError += ` Process cleanup failed: ${String(failure)}`; }
      }).then(() => {
        pending--;
        if (!pending && !done) { child.stdout.resume(); child.stderr.resume(); }
      });
    });
    child[stream].on("error", error => {
      ioError = error.message;
      void stop().catch(failure => { ioError += ` Process cleanup failed: ${String(failure)}`; });
    });
  }
  child.once("error", error => {
    exit ??= { exitCode: null, signal: null, error: error.message };
    resolveExit(exit); finish();
  });
  child.once("exit", (exitCode, signal) => {
    exit = { exitCode, signal, error: null };
    resolveExit(exit); armIdle();
  });
  child.once("close", finish);
  return { exited, settled, stop };
}
