import { ApplicationService } from "./service.ts";
import { dispatch } from "./dispatch.ts";
import { protocolVersion } from "../shared/contracts.ts";
import { SecretClient } from "./secret-client.ts";
import { join } from "node:path";
import { importPackages, packageCandidates, runtimeDependencies } from "../plugins/packages.ts";
import { readPluginBuild } from "../plugins/artifacts.ts";
import { userSkillDirectory } from "../plugins/agent-catalog.ts";
import { DatabaseVersionError } from "./storage.ts";
import { RendererConnection } from "./connection.ts";
import type { RendererFrame, RuntimeFrame } from "../shared/connection.ts";
import { z } from "zod";
import { pluginStorageFailureSchema } from "../shared/recovery.ts";

// Task processes accept application data roots only from the main process, never renderer file paths.
const port = process.parentPort;
if (!port) throw new Error("The task runtime must be started as an Electron utility process.");
let service: ApplicationService;
const secrets = new SecretClient(message => port.postMessage(message));
/** Direct renderer connections handed off by the main process; main-process-assigned numbers support explicit disconnection. */
const connections = new Map<string, RendererConnection>();
const broadcast = (frame: RuntimeFrame) => { for (const connection of connections.values()) connection.send(frame); };
try {
  const root = process.argv[2];
  if (!root) throw new Error("Application data directory is required.");
  // Plugins whose storage could not be upgraded during pre-window preparation skip setup for this startup.
  const storageFailures = new Map(z.array(pluginStorageFailureSchema).parse(JSON.parse(process.argv[3] ?? "[]")).map(item => [item.id, item.error]));
  const started = performance.now();
  // Import the build captured during data preparation; list and source changes belong to the next startup.
  port.postMessage({ kind: "startup", stage: "plugins" });
  const pluginBuild = process.argv[4];
  if (!pluginBuild) throw new Error("The task runtime requires a prepared plugin build.");
  const packages = await importPackages(readPluginBuild(pluginBuild), join(root, "plugins", ".cache"), {
    storageFailures, progress: detail => port.postMessage({ kind: "startup", stage: "plugins", detail }),
  });
  console.info(`Plugin package preparation completed in ${Math.round(performance.now() - started)} ms.`);
  for (const item of packages) if (item.diagnostic) console.error(`Plugin package ${item.root} failed during ${item.diagnostic.stage}: ${item.diagnostic.message}`);
  port.postMessage({ kind: "startup", stage: "workspace" });
  service = new ApplicationService(root, { catalogs: packages.flatMap(item => item.catalogs ?? []),
    packages: packageCandidates(packages), packageEntries: packages.map(item => item.entry),
    skillDirectories: [userSkillDirectory()],
    packageRoots: new Map(packages.flatMap(item => item.manifest ? [[item.manifest.id, item.root] as const] : [])),
    manualSources: packages.flatMap(item => item.status === "ready" && item.manifest
      ? (item.manualSources ?? []).map(source => ({ ...source, pluginId: item.manifest!.id })) : []),
    plugins: packages.flatMap(item => item.definition ? [item.definition] : []), protector: secrets,
    pluginDependencies: runtimeDependencies(packages),
    preparedStorage: { failures: storageFailures,
      declarations: new Map(packages.flatMap(item => item.manifest && item.storage ? [[item.manifest.id, item.storage] as const] : [])) },
    onConfigurationChanged: () => broadcast({ kind: "configuration.changed" }),
    onSessionChanged: event => broadcast({ kind: "session", event }),
    onPluginConfigurationChanged: id => broadcast({ kind: "plugin-configuration.changed", id }) });
  const disconnect = (id: string) => { const connection = connections.get(id); connections.delete(id); connection?.close(); };
  port.on("message", ({ data, ports }) => {
    if (data?.kind === "shutdown") {
      for (const id of [...connections.keys()]) disconnect(id);
      secrets.close();
      void service.close().finally(() => { process.exit(0); });
      return;
    }
    if (data?.kind === "ping") { port.postMessage({ kind: "pong" }); return; }
    if (secrets.receive(data)) return;
    if (data?.kind === "connection.open" && typeof data.id === "string" && ports[0]) {
      disconnect(data.id);
      const endpoint = ports[0];
      const connection = new RendererConnection(service, {
        post: message => endpoint.postMessage(message),
        onMessage: listener => endpoint.on("message", event => listener(event.data as RendererFrame)),
        close: () => endpoint.close(),
      }, () => { if (connections.get(data.id) === connection) connections.delete(data.id); });
      // Destroying renderer pages closes their ports and ends connections.
      endpoint.on("close", () => connection.close());
      connections.set(data.id, connection);
      endpoint.start();
      return;
    }
    if (data?.kind === "connection.close" && typeof data.id === "string") { disconnect(data.id); return; }
    const response = dispatch(service, data);
    if (response) port.postMessage(response);
  });
  console.info(`Task runtime initialization completed in ${Math.round(performance.now() - started)} ms.`);
  port.postMessage({ kind: "ready", version: protocolVersion });
} catch (error) {
  console.error("Task runtime initialization failed.", error);
  port.postMessage(error instanceof DatabaseVersionError
    ? { kind: "fatal", reason: "database_version", message: error.message, directory: error.directory }
    : { kind: "fatal", reason: "unknown", message: "The workspace could not be opened. Check the application logs." });
  process.exitCode = 1;
}
