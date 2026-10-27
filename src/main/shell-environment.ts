import { shellEnv } from "shell-env";

/**
 * Apps launched from Finder/Dock receive only launchd's minimal environment; read the user's login shell environment into the main process at startup,
 * so the task process and its shells, terminals, and plugin subprocesses inherit the same environment. shell-env returns Windows environments unchanged.
 */
export async function adoptLoginShellEnvironment(signal?: AbortSignal): Promise<void> {
  try {
    const resolved = await shellEnv();
    if (signal?.aborted) return;
    for (const [key, value] of Object.entries(resolved)) if (value !== undefined) process.env[key] = value;
  } catch (error) {
    console.error("Login shell environment could not be resolved.", error);
  }
}
