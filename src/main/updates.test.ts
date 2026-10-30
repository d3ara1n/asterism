import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApplicationUpdates } from "./updates.ts";

const { updater } = vi.hoisted(() => ({
  updater: {
    on: vi.fn(), once: vi.fn(), removeListener: vi.fn(),
    setFeedURL: vi.fn(), checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: vi.fn(),
  },
}));
vi.mock("electron-updater", () => ({ default: { autoUpdater: updater } }));
vi.mock("electron-store", () => ({
  default: class { get() { return false; } set() {} },
}));
vi.mock("electron", () => ({
  app: { getPath: () => "unused", getVersion: () => "1.0.0", isPackaged: true },
  ipcMain: {},
  net: { fetch: async () => ({
    ok: true,
    json: async () => [{ tag_name: "v1.1.0", html_url: "https://example.com/v1.1.0", prerelease: false, draft: false }],
  }) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  updater.checkForUpdates.mockResolvedValue({ isUpdateAvailable: true, updateInfo: { version: "1.1.0" } });
  updater.downloadUpdate.mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

async function downloadedUpdate() {
  const updates = new ApplicationUpdates();
  await updates.check();
  expect(updates.get().status).toBe("ready");
  return updates;
}

it("keeps restart pending through cleanup and installer handoff, rejecting repeated actions", async () => {
  const updates = await downloadedUpdate();
  let finish!: (started: boolean) => void;
  const quit = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const restarting = updates.restart(quit);
  expect(updates.get().status).toBe("restarting");
  await updates.restart(quit);
  await updates.check();
  updates.set(true);
  expect(quit).toHaveBeenCalledTimes(1);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  expect(updates.get().status).toBe("restarting");
  updates.install(vi.fn());
  expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  finish(true);
  await restarting;
  expect(updates.get().status).toBe("restarting");
  await updates.restart(quit);
  expect(quit).toHaveBeenCalledTimes(1);
});

it("allows another restart after the user cancels the exit confirmation", async () => {
  const updates = await downloadedUpdate();
  await updates.restart(async () => false);
  expect(updates.get().status).toBe("ready");
  await updates.restart(async () => true);
  expect(updates.get().status).toBe("restarting");
});

it("exposes shutdown failure instead of leaving the restart action busy", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const updates = await downloadedUpdate();
  await updates.restart(async () => { throw new Error("Resource cleanup failed."); });
  expect(updates.get()).toMatchObject({ status: "error", error: "Resource cleanup failed." });
});

it("retains native installation errors after the restart request has returned", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const updates = await downloadedUpdate();
  await updates.restart(async () => true);
  const onError = updater.on.mock.calls.find(([event]) => event === "error")![1];
  onError(new Error("Signature validation failed."));
  expect(updates.get()).toMatchObject({ status: "error", error: "Signature validation failed." });
});
