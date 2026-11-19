import { z } from "zod";
import { defineCreation, pluginNamespace, ResourcePresenceChanged } from "@asterism-app/sdk/contracts";
import { definePlugin, implementCreation, implementResource, type PluginContext } from "@asterism-app/sdk/runtime";
import { McpApplication } from "../mcp/application.ts";
import { ShellHost } from "../shell/host.ts";
import { RendererConnection } from "./connection.ts";
import type { RendererFrame, RuntimeFrame } from "../shared/connection.ts";
import type { PluginCandidate } from "../shared/plugin-startup.ts";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ApplicationService } from "./service.ts";
import sdkMetadata from "@asterism-app/sdk/package.json" with { type: "json" };
import { applicationPackages } from "../plugins/distribution.ts";
import type { Distribution } from "../plugins/packages.ts";

const roots: string[] = [], services: ApplicationService[] = [];
const emptyArtifact = (id: string) => ({ format: 2 as const, id, public: { runtime: {}, renderer: {} },
  imports: { runtime: [], renderer: [] }, stylesheets: [] });
function publishFixtureArtifact(root: string, id: string): void {
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist/artifact.json"), JSON.stringify(emptyArtifact(id)));
}
/** A one-package distribution inside the test root, so selection tests do not depend on the repository's built plugins. */
function fixtureDistribution(root: string): Distribution {
  const directory = join(root, "distribution"), bundle = join(directory, "bundle");
  mkdirSync(bundle, { recursive: true });
  writeFileSync(join(bundle, "package.json"), JSON.stringify({ name: "bundle", description: "Bundled fixture description",
    asterism: { id: "fixture.bundled", displayName: "Bundled fixture" } }));
  publishFixtureArtifact(bundle, "fixture.bundled");
  return { packages: [{ source: { kind: "bundled", name: "bundle" }, enabled: true }], directory };
}
/** A minimal local package with a completed artifact. */
function pathPackage(root: string, name: string, id: string): string {
  const dir = join(root, name); mkdirSync(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ asterism: { id, displayName: name } }));
  publishFixtureArtifact(dir, id);
  return dir;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const service of services.splice(0)) await service.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// Bundled packages and user-added packages share the same persisted enablement and removal operations.
it("application commands register and remove plugin packages and represent restart markers correctly", () => {
  const root = mkdtempSync(join(tmpdir(), "core-session-")); roots.push(root);
  const service = new ApplicationService(root, { distribution: fixtureDistribution(root) }); services.push(service);
  const dir = join(root, "pkg"); mkdirSync(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "p", peerDependencies: { "@asterism-app/sdk": `^${sdkMetadata.version}` }, asterism: { displayName: "Test plugin", id: "acme.p" } }));
  publishFixtureArtifact(dir, "acme.p");
  const added = service.execute({ type: "plugin.add", path: dir });
  expect(added.plugins.map(p => [p.source, p.selection, p.pending])).toEqual([["bundled:bundle", { enabled: true }, false], [dir, { enabled: true }, true]]);
  expect(added.plugins[0]).toMatchObject({ id: "fixture.bundled", origin: { kind: "bundled" } });
  expect(added.plugins[1]).toMatchObject({ id: "acme.p", origin: { kind: "path", path: dir }, metadata: { name: "Test plugin" } });
  expect(added.restartRequired).toBe(true);
  // A package added and removed within one run never ran, so it leaves no entry.
  const removed = service.execute({ type: "plugin.remove", source: dir });
  expect(removed.restartRequired).toBe(false);
  expect(removed.plugins.map(p => p.source)).toEqual(["bundled:bundle"]);
  expect(service.execute({ type: "plugin.enable", source: "bundled:bundle", enabled: false }).plugins[0]).toMatchObject({ selection: { enabled: false }, pending: true });
  expect(() => service.execute({ type: "plugin.enable", source: dir, enabled: true })).toThrow("No such package entry");
});

// Removing a distribution entry must retain its recovery card without silently restoring persistence.
it("keeps removed bundled packages discoverable and adds them back through the ordinary loading list", () => {
  const root = mkdtempSync(join(tmpdir(), "bundled-plugin-")); roots.push(root);
  const distribution = fixtureDistribution(root);
  const service = new ApplicationService(root, { distribution }); services.push(service);
  const removed = service.execute({ type: "plugin.remove", source: "bundled:bundle" });
  expect(removed.plugins).toHaveLength(1);
  expect(removed.plugins[0]).toMatchObject({
    source: "bundled:bundle", id: "fixture.bundled", origin: { kind: "bundled" }, selection: null, pending: true,
    metadata: { name: "Bundled fixture", description: "Bundled fixture description" },
  });
  expect(removed.restartRequired).toBe(true);
  expect(applicationPackages(root, distribution).read()).toEqual([]);
  const restored = service.execute({ type: "plugin.restore", source: "bundled:bundle" });
  expect(restored.plugins).toEqual([expect.objectContaining({ selection: { enabled: true }, pending: false })]);
  expect(applicationPackages(root, distribution).read()).toEqual([{ source: { kind: "bundled", name: "bundle" }, enabled: true }]);
  expect(restored.restartRequired).toBe(false);
});

// Recovery comes from the distribution, including when a user edits the file before startup.
it("discovers bundled packages absent from the saved list without shifting configured positions", () => {
  const root = mkdtempSync(join(tmpdir(), "bundled-plugin-")); roots.push(root);
  const distribution = fixtureDistribution(root);
  const dir = pathPackage(root, "external", "acme.external");
  applicationPackages(root, distribution).add({ source: { kind: "path", path: dir } }, root);
  const file = join(root, "plugins.json");
  const saved = JSON.parse(readFileSync(file, "utf8"));
  saved.packages.splice(0, 1);
  writeFileSync(file, JSON.stringify(saved));
  const service = new ApplicationService(root, { distribution }); services.push(service);
  const snapshot = service.execute({ type: "workspace.read" });
  expect(snapshot.plugins.map(plugin => [plugin.source, plugin.selection, plugin.pending])).toEqual([
    [dir, { enabled: true }, false], ["bundled:bundle", null, false],
  ]);
  expect(snapshot.restartRequired).toBe(false);
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(saved);
  const restored = service.execute({ type: "plugin.restore", source: "bundled:bundle" });
  expect(restored.restartRequired).toBe(true);
  expect(restored.plugins.map(plugin => [plugin.source, plugin.pending])).toEqual([[dir, false], ["bundled:bundle", true]]);
  // The path package ran in this startup, so it stays listed until restart.
  expect(service.execute({ type: "plugin.remove", source: dir }).plugins.map(plugin => [plugin.source, plugin.selection, plugin.pending]))
    .toEqual([["bundled:bundle", { enabled: true }, true], [dir, null, true]]);
});

// Undoing a removal before restart must reproduce the captured loading list, not append a fresh enabled entry.
it("restores packages removed since startup at their captured position and enablement", () => {
  const root = mkdtempSync(join(tmpdir(), "restore-plugin-")); roots.push(root);
  const distribution = fixtureDistribution(root);
  const list = applicationPackages(root, distribution);
  const first = pathPackage(root, "first", "acme.first"), second = pathPackage(root, "second", "acme.second");
  list.add({ source: { kind: "path", path: first } }, root);
  list.add({ source: { kind: "path", path: second } }, root);
  list.setEnabled(1, false);
  const started = list.read();
  const service = new ApplicationService(root, { distribution }); services.push(service);
  service.execute({ type: "plugin.remove", source: first });
  const removed = service.execute({ type: "plugin.remove", source: "bundled:bundle" });
  expect(removed.plugins.map(plugin => [plugin.source, plugin.selection])).toEqual([[second, { enabled: true }], ["bundled:bundle", null], [first, null]]);
  service.execute({ type: "plugin.restore", source: first });
  const restored = service.execute({ type: "plugin.restore", source: "bundled:bundle" });
  expect(list.read()).toEqual(started);
  expect(restored.restartRequired).toBe(false);
  expect(restored.plugins.every(plugin => !plugin.pending)).toBe(true);
});

// The same plugin can be registered by path; recovery must respect plugin identity, not just source labels.
it("hides recovery for a bundled identity already added by path and rejects duplicate or unknown additions", () => {
  const root = mkdtempSync(join(tmpdir(), "bundled-plugin-")); roots.push(root);
  const distribution = fixtureDistribution(root);
  const list = applicationPackages(root, distribution);
  const path = join(distribution.directory, "bundle");
  list.remove(0);
  list.add({ source: { kind: "path", path } }, root);
  const service = new ApplicationService(root, { distribution }); services.push(service);
  expect(service.execute({ type: "workspace.read" }).plugins).toHaveLength(1);
  expect(() => service.execute({ type: "plugin.restore", source: "bundled:bundle" })).toThrow("already added");
  expect(() => service.execute({ type: "plugin.restore", source: "bundled:missing" })).toThrow("No such package to restore");
  expect(list.read()).toHaveLength(1);
  expect(service.execute({ type: "plugin.remove", source: path }).plugins.map(plugin => [plugin.source, plugin.selection, plugin.pending]))
    .toEqual([[path, null, true], ["bundled:bundle", null, false]]);
});

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function lifecycleFixture() {
  const namespace = pluginNamespace("test.shutdown");
  const Item = namespace.resource("item", z.object({}));
  const View = namespace.data("view", z.null());
  const Create = defineCreation(Item, {
    id: namespace.name("create"),
    schema: z.null(),
  });
  let context!: PluginContext;
  const plugin = definePlugin({
    namespace,
    setup(value) {
      context = value;
      return {
        resources: [
          implementResource(Item, View, {
            creation: implementCreation(Create, {
              create: () => ({ title: "Item", data: {} }),
            }),
            project: () => null,
            inspect: async () => null,
          }),
        ],
      };
    },
  });
  const root = mkdtempSync(join(tmpdir(), "shutdown-session-"));
  roots.push(root);
  const service = new ApplicationService(root, { plugins: [plugin] });
  services.push(service);
  const sessionId = service.sessions.tree.create("Cleanup");
  const resource = await context.session(sessionId).create(Create, null);
  const started = gate(),
    cancelled = gate(),
    finish = gate();
  context.tasks.start(
    "owned",
    async (signal) => {
      const abort = new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      started.release();
      await abort;
      cancelled.release();
      await finish.promise;
    },
    { object: resource },
  );
  await started.promise;
  return { service, sessionId, cancelled, finish };
}

it("joins accepted archive cancellation before plugin disposal and shared cleanup", async () => {
  const { service, sessionId, cancelled, finish } = await lifecycleFixture();
  const sharedClose = vi.spyOn(McpApplication.prototype, "close");
  const archived = service.sessions.execute({ type: "archive", sessionId });
  await cancelled.promise;
  services.splice(services.indexOf(service), 1);
  const closed = service.close();
  try {
    expect(sharedClose).not.toHaveBeenCalled();
    finish.release();
    await archived;
    // Archive persistence must complete before storage is released.
    await closed;
    const reopened = new ApplicationService(roots.at(-1)!);
    services.push(reopened);
    expect(
      reopened.sessions.tree.archived().map((session) => session.id),
    ).toContain(sessionId);
  } finally {
    finish.release();
    await closed;
    sharedClose.mockRestore();
  }
});

it("preserves a structural archive failure, attempts independent cleanup, and closes storage after cleanup settles", async () => {
  const { service, sessionId, cancelled, finish } = await lifecycleFixture();
  const failure = new Error("Archive presence publication failed.");
  const publish = service.sessions.events.publish.bind(service.sessions.events);
  vi.spyOn(service.sessions.events, "publish").mockImplementation(
    (contract, source, value) => {
      if (contract.id === ResourcePresenceChanged.id) throw failure;
      return publish(contract, source, value);
    },
  );
  const sharedClose = vi.spyOn(McpApplication.prototype, "close");
  const contentClose = vi.spyOn(service.sessions.content, "close");
  const archived = service.sessions.execute({ type: "archive", sessionId });
  const archiveFailure = expect(archived).rejects.toBe(failure);
  await cancelled.promise;
  services.splice(services.indexOf(service), 1);
  const closed = service.close();
  const closeFailure = expect(closed).rejects.toBe(failure);
  finish.release();
  await archiveFailure;
  await closeFailure;
  expect(sharedClose).toHaveBeenCalledOnce();
  expect(contentClose).toHaveBeenCalledOnce();
  expect(() => service.sessions.tree.list()).toThrow("database is not open");
  const reopened = new ApplicationService(roots.at(-1)!);
  services.push(reopened);
  expect(reopened.sessions.tree.lifecycle(sessionId)).toBe("running");
  sharedClose.mockRestore();
});

it("waits for independent shared and transfer cleanup after a shared cleanup rejection, then releases storage", async () => {
  const root = mkdtempSync(join(tmpdir(), "failed-cleanup-"));
  roots.push(root);
  const service = new ApplicationService(root);
  const failure = new Error("MCP cleanup failed.");
  const original = McpApplication.prototype.close;
  const mcpClose = vi
    .spyOn(McpApplication.prototype, "close")
    .mockImplementationOnce(async function (this: McpApplication) {
      await original.call(this);
      throw failure;
    });
  const shellStarted = gate(),
    shellFinish = gate(),
    transferStarted = gate(),
    transferFinish = gate();
  const shellOriginal = ShellHost.prototype.close;
  const shellClose = vi
    .spyOn(ShellHost.prototype, "close")
    .mockImplementationOnce(async function (this: ShellHost) {
      shellStarted.release();
      await shellFinish.promise;
      await shellOriginal.call(this);
    });
  const transferOriginal = service.content.close.bind(service.content);
  vi.spyOn(service.content, "close").mockImplementationOnce(async () => {
    transferStarted.release();
    await transferFinish.promise;
    await transferOriginal();
  });
  const sessionContentClose = vi.spyOn(service.sessions.content, "close");
  const closed = service.close();
  const rejected = expect(closed).rejects.toBe(failure);
  try {
    await shellStarted.promise;
    await transferStarted.promise;
    await expect(mcpClose.mock.results[0]!.value).rejects.toBe(failure);
    expect(sessionContentClose).not.toHaveBeenCalled();
    expect(() => service.sessions.tree.list()).not.toThrow();
    shellFinish.release();
    // The transfer gate is still holding storage even after the failing shared group settles.
    expect(() => service.sessions.tree.list()).not.toThrow();
    transferFinish.release();
    await rejected;
    expect(() => service.sessions.tree.list()).toThrow("database is not open");
  } finally {
    shellFinish.release();
    transferFinish.release();
    await rejected;
    mcpClose.mockRestore();
    shellClose.mockRestore();
  }
});

function renderer(service: ApplicationService) {
  let receive!: (frame: RendererFrame) => void;
  const replies = new Map<number, (frame: RuntimeFrame) => void>();
  let id = 0;
  const connection = new RendererConnection(service, {
    post(frame) {
      if (frame.kind === "response") {
        replies.get(frame.id)?.(frame);
        replies.delete(frame.id);
      }
    },
    onMessage(listener) {
      receive = listener;
    },
    close() {},
  });
  return {
    connection,
    send(command: unknown) {
      receive({ kind: "request", service: "session", id: ++id, command });
    },
    request(command: unknown) {
      return new Promise<RuntimeFrame>((resolve) => {
        replies.set(++id, resolve);
        receive({ kind: "request", service: "session", id, command });
      });
    },
  };
}

it.each(["unwatch", "close"] as const)(
  "preserves a replacement renderer hold across the old owner's %s",
  async (mode) => {
    const root = mkdtempSync(join(tmpdir(), "watch-session-"));
    roots.push(root);
    const service = new ApplicationService(root);
    services.push(service);
    const sessionId = service.sessions.tree.create("Watched");
    const old = renderer(service),
      replacement = renderer(service);
    await old.request({ type: "watch", sessionId });
    await replacement.request({ type: "watch", sessionId });
    const release = vi.spyOn(service.sessions.tree, "releaseCache");
    if (mode === "unwatch") await old.request({ type: "unwatch", sessionId });
    old.connection.close();
    expect(release).not.toHaveBeenCalled();
    replacement.connection.close();
    expect(release).toHaveBeenCalledExactlyOnceWith(sessionId);
  },
);

it("does not install a pending watch after its concrete connection disconnects", async () => {
  const root = mkdtempSync(join(tmpdir(), "watch-session-"));
  roots.push(root);
  const service = new ApplicationService(root);
  services.push(service);
  const sessionId = service.sessions.tree.create("Watched");
  const old = renderer(service),
    replacement = renderer(service);
  const execute = vi.spyOn(service.sessions, "execute");
  const open = vi.spyOn(service.sessions.tree, "open");
  old.send({ type: "watch", sessionId });
  const pending = execute.mock.results[0]!.value;
  old.connection.close();
  await expect(pending).rejects.toMatchObject({ code: "unavailable" });
  expect(open).not.toHaveBeenCalled();
  await replacement.request({ type: "watch", sessionId });
  const release = vi.spyOn(service.sessions.tree, "releaseCache");
  old.connection.close();
  expect(release).not.toHaveBeenCalled();
  replacement.connection.close();
  expect(release).toHaveBeenCalledExactlyOnceWith(sessionId);
});

it.each(["disable", "remove"] as const)(
  "keeps captured renderer composition after %s until a real new startup",
  async (action) => {
    const root = mkdtempSync(join(tmpdir(), "renderer-composition-"));
    roots.push(root);
    const dir = join(root, "plugin");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        asterism: { id: "test.renderer", displayName: "Renderer" },
      }),
    );
    publishFixtureArtifact(dir, "test.renderer");
    applicationPackages(root).add(
      { source: { kind: "path", path: dir } },
      root,
    );
    const candidate: PluginCandidate = {
      source: dir,
      id: "test.renderer",
      metadata: { name: "Captured name" },
      enabled: true,
      status: "ready",
      renderer: "asterism-plugin://test.renderer/view.js",
      stylesheet: "asterism-plugin://test.renderer/style.css",
      dependencies: [],
      rendererDependencies: ["test.public"],
    };
    const service = new ApplicationService(root, { packages: [candidate] });
    services.push(service);
    const captured = service.execute({
      type: "workspace.read",
    }).rendererPlugins;
    expect(captured).toEqual([
      {
        id: "test.renderer",
        source: dir,
        metadata: { name: "Captured name" },
        renderer: candidate.renderer,
        stylesheet: candidate.stylesheet,
        stylesheets: [],
        dependencies: ["test.public"],
      },
    ]);
    const changed = service.execute(
      action === "disable"
        ? { type: "plugin.enable", source: dir, enabled: false }
        : { type: "plugin.remove", source: dir },
    );
    expect(changed.rendererPlugins).toEqual(captured);
    expect(changed.restartRequired).toBe(true);
    // Both changes keep the running outcome visible beside the next-start selection.
    expect(changed.plugins.find((plugin) => plugin.source === dir)).toEqual(
      expect.objectContaining({
        selection: action === "disable" ? { enabled: false } : null,
        startup: expect.objectContaining({ source: dir, status: "loaded" }),
        pending: true,
      }),
    );
    expect(service.execute({ type: "workspace.read" }).rendererPlugins).toEqual(
      captured,
    );
    await service.close();
    services.splice(services.indexOf(service), 1);
    const next = new ApplicationService(root, {
      packages:
        action === "disable"
          ? [{ ...candidate, enabled: false, status: "disabled" }]
          : [],
    });
    services.push(next);
    expect(next.execute({ type: "workspace.read" }).rendererPlugins).toEqual(
      [],
    );
    expect(next.execute({ type: "workspace.read" }).restartRequired).toBe(
      false,
    );
  },
);
