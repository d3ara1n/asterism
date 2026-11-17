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
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApplicationService } from "./service.ts";
import sdkMetadata from "@asterism-app/sdk/package.json" with { type: "json" };
import { applicationPackages } from "../plugins/distribution.ts";
import { applicationDirectory } from "../plugins/package-modules.ts";
import * as artifactResolver from "../plugins/artifact-resolver.ts";

const roots: string[] = [], services: ApplicationService[] = [];
const emptyArtifact = (id: string) => ({ format: 2 as const, id, public: { runtime: {}, renderer: {} },
  imports: { runtime: [], renderer: [] }, stylesheets: [] });
function publishFixtureArtifact(root: string, id: string): void {
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist/artifact.json"), JSON.stringify(emptyArtifact(id)));
}
// Application-list tests exercise selection, not the separate process-backed distribution build contract.
// Bundled and path sources reach the builtin root with and without a trailing separator; both must avoid built output.
const captureArtifact = artifactResolver.captureArtifact;
const builtinRoot = resolve(applicationDirectory("packages/builtin"));
beforeEach(() => {
  vi.spyOn(artifactResolver, "captureArtifact").mockImplementation((root, id) => resolve(root) === builtinRoot
    ? { artifact: emptyArtifact(id), artifactRoot: root } : captureArtifact(root, id));
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const service of services.splice(0)) await service.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// Bundled packages and user-added packages share the same persisted enablement and removal operations.
it("application commands register and remove plugin packages and represent restart markers correctly", () => {
  const root = mkdtempSync(join(tmpdir(), "core-session-")); roots.push(root);
  const service = new ApplicationService(root); services.push(service);
  const dir = join(root, "pkg"); mkdirSync(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "p", peerDependencies: { "@asterism-app/sdk": `^${sdkMetadata.version}` }, asterism: { displayName: "Test plugin", id: "acme.p" } }));
  publishFixtureArtifact(dir, "acme.p");
  const added = service.execute({ type: "plugin.add", path: dir });
  expect(added.plugins.map(p => [p.source, p.status, p.enabled])).toEqual([["bundled:builtin", "pending", true], [dir, "pending", true]]);
  expect(added.plugins[0]).toMatchObject({ id: "asterism.builtin", index: 0, bundled: true });
  expect(added.restartRequired).toBe(true);
  expect(service.execute({ type: "plugin.remove", index: 1 }).restartRequired).toBe(false);
  expect(service.execute({ type: "plugin.enable", index: 0, enabled: false }).plugins[0]?.enabled).toBe(false);
});

// Removing a distribution entry must retain its recovery card without silently restoring persistence.
it("keeps removed bundled packages discoverable and adds them back through the ordinary loading list", () => {
  const root = mkdtempSync(join(tmpdir(), "bundled-plugin-")); roots.push(root);
  const service = new ApplicationService(root); services.push(service);
  const removed = service.execute({ type: "plugin.remove", index: 0 });
  expect(removed.plugins).toHaveLength(1);
  expect(removed.plugins[0]).toMatchObject({
    source: "bundled:builtin", id: "asterism.builtin", index: null, bundled: true,
    status: "available", enabled: false, renderer: null,
    metadata: { name: { defaultMessage: "Asterism Essentials" }, description: { defaultMessage: "Agents, conversations, notes, files and interactive tools." } },
  });
  expect(removed.restartRequired).toBe(true);
  expect(applicationPackages(root).read()).toEqual([]);
  const restored = service.execute({ type: "plugin.add-bundled", source: "bundled:builtin" });
  expect(restored.plugins).toHaveLength(1);
  expect(restored.plugins[0]).toMatchObject({ index: 0, enabled: true, status: "pending" });
  expect(applicationPackages(root).read()).toEqual([{ source: { kind: "bundled", name: "builtin" }, enabled: true }]);
  expect(restored.restartRequired).toBe(false);
});

// Recovery comes from the distribution, including when a user edits the file before startup.
it("discovers bundled packages absent from the saved list without shifting configured indices", () => {
  const root = mkdtempSync(join(tmpdir(), "bundled-plugin-")); roots.push(root);
  const dir = join(root, "external"); mkdirSync(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ asterism: { id: "acme.external", displayName: "External plugin" } }));
  publishFixtureArtifact(dir, "acme.external");
  applicationPackages(root).add({ source: { kind: "path", path: dir } }, root);
  const file = join(root, "plugins.json");
  const saved = JSON.parse(readFileSync(file, "utf8"));
  saved.packages.splice(0, 1);
  writeFileSync(file, JSON.stringify(saved));
  const service = new ApplicationService(root); services.push(service);
  const snapshot = service.execute({ type: "workspace.read" });
  expect(snapshot.plugins.map(plugin => [plugin.source, plugin.index, plugin.status])).toEqual([
    [dir, 0, "pending"], ["bundled:builtin", null, "available"],
  ]);
  expect(snapshot.restartRequired).toBe(false);
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(saved);
  const restored = service.execute({ type: "plugin.add-bundled", source: "bundled:builtin" });
  expect(restored.restartRequired).toBe(true);
  expect(restored.plugins.map(plugin => [plugin.source, plugin.index])).toEqual([[dir, 0], ["bundled:builtin", 1]]);
  expect(service.execute({ type: "plugin.remove", index: 0 }).plugins.map(plugin => plugin.source)).toEqual(["bundled:builtin"]);
});

// The same plugin can be registered by path; recovery must respect plugin identity, not just source labels.
it("hides recovery for a bundled identity already added by path and rejects duplicate or unknown additions", () => {
  const root = mkdtempSync(join(tmpdir(), "bundled-plugin-")); roots.push(root);
  const list = applicationPackages(root);
  list.remove(0);
  list.add({ source: { kind: "path", path: applicationDirectory("packages/builtin") } }, root);
  const service = new ApplicationService(root); services.push(service);
  expect(service.execute({ type: "workspace.read" }).plugins).toHaveLength(1);
  expect(() => service.execute({ type: "plugin.add-bundled", source: "bundled:builtin" })).toThrow("already added");
  expect(() => service.execute({ type: "plugin.add-bundled", source: "bundled:missing" })).toThrow("No such bundled package");
  expect(list.read()).toHaveLength(1);
  expect(service.execute({ type: "plugin.remove", index: 0 }).plugins[0]).toMatchObject({ source: "bundled:builtin", status: "available" });
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
        ? { type: "plugin.enable", index: 1, enabled: false }
        : { type: "plugin.remove", index: 1 },
    );
    expect(changed.rendererPlugins).toEqual(captured);
    expect(changed.restartRequired).toBe(true);
    expect(changed.plugins.find((plugin) => plugin.source === dir)).toEqual(
      action === "disable"
        ? expect.objectContaining({
            status: "pending",
            enabled: false,
            renderer: null,
          })
        : undefined,
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
