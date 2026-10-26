import { ApplicationService } from "./service.ts";
import { dispatch } from "./dispatch.ts";
import { protocolVersion } from "../shared/contracts.ts";
import { SecretClient } from "./secret-client.ts";
import { join } from "node:path";
import { PackageList, loadPackages } from "../plugins/packages.ts";
import { builtin } from "@atelier/builtin-api/contracts";
import { DatabaseVersionError } from "./storage.ts";
import { RendererConnection } from "./connection.ts";
import type { RendererFrame, RuntimeFrame } from "../shared/connection.ts";
import { bindPublicProvider } from "../shared/public-modules.ts";
import { builtinPublicProvider } from "../builtin-public.ts";
import { builtinRuntimePublicModules } from "../builtin-runtime-public.ts";
import { z } from "zod";
import { pluginStorageFailureSchema } from "../shared/recovery.ts";

// 任务进程只接收主进程给出的应用数据根目录，不接受 renderer 文件路径。
const port = process.parentPort;
if (!port) throw new Error("The task runtime must be started as an Electron utility process.");
let service: ApplicationService;
const secrets = new SecretClient(message => port.postMessage(message));
const releasePublic = bindPublicProvider("runtime", builtinPublicProvider, builtinRuntimePublicModules);
/** 主进程交接的 renderer 直连；编号由主进程分配，用于显式断开。 */
const connections = new Map<string, RendererConnection>();
const broadcast = (frame: RuntimeFrame) => { for (const connection of connections.values()) connection.send(frame); };
try {
  const root = process.argv[2];
  if (!root) throw new Error("Application data directory is required.");
  // 窗口前数据准备未能升级存储的插件；本次启动不进入 setup。
  const storageFailures = new Map(z.array(pluginStorageFailureSchema).parse(JSON.parse(process.argv[3] ?? "[]")).map(item => [item.id, item.error]));
  const started = performance.now();
  // 插件包只在启动时解析、打包与导入；列表变化重启后生效。
  port.postMessage({ kind: "startup", stage: "plugins" });
  const packages = await loadPackages(new PackageList(join(root, "plugins.json")), join(root, "plugins"), join(root, "plugins", ".cache"),
    [builtin.id], [builtinPublicProvider], detail => port.postMessage({ kind: "startup", stage: "plugins", detail }));
  console.info(`Plugin package preparation completed in ${Math.round(performance.now() - started)} ms.`);
  for (const item of packages) if (item.error) console.error(`Plugin package ${item.root} is ${item.status}: ${item.error}`);
  const listed = packages.map(item => ({ enabled: item.entry.enabled, id: item.manifest?.id ?? null,
    source: item.entry.source.kind === "path" ? item.entry.source.path : `${item.entry.source.name}@${item.entry.source.version}`,
    status: item.status, error: item.error ?? null, renderer: item.status === "loaded" ? item.renderer ?? null : null,
    dependencies: item.dependencies ?? [], rendererDependencies: item.rendererDependencies ?? [] }));
  port.postMessage({ kind: "startup", stage: "workspace" });
  service = new ApplicationService(root, { catalogs: packages.flatMap(item => item.catalogs ?? []), packages: listed,
    plugins: packages.flatMap(item => item.definition ? [item.definition] : []), protector: secrets,
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
      void service.close().finally(() => { releasePublic(); process.exit(0); });
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
      // renderer 页面销毁时端口关闭，连接随之结束。
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
  releasePublic();
  console.error("Task runtime initialization failed.", error);
  port.postMessage(error instanceof DatabaseVersionError
    ? { kind: "fatal", reason: "database_version", message: error.message, directory: error.directory }
    : { kind: "fatal", reason: "unknown", message: "The workspace could not be opened. Check the application logs." });
  process.exitCode = 1;
}
