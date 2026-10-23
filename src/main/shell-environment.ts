import { shellEnv } from "shell-env";

/**
 * 从 Finder／Dock 启动的应用只取得 launchd 的最小环境；启动时读取用户登录 shell 的环境并写回主进程，
 * 任务进程与其派生的 shell、终端和插件子进程随之继承同一份环境。Windows 由 shell-env 原样返回。
 */
export async function adoptLoginShellEnvironment(): Promise<void> {
  try {
    const resolved = await shellEnv();
    for (const [key, value] of Object.entries(resolved)) if (value !== undefined) process.env[key] = value;
  } catch (error) {
    console.error("Login shell environment could not be resolved.", error);
  }
}
