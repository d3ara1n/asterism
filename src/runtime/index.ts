import { ApplicationService } from "./service.ts";
import { dispatch, dispatchConfiguration, dispatchSession, dispatchPluginConfiguration, dispatchContent } from "./dispatch.ts";
import { protocolVersion } from "../shared/contracts.ts";
import { SecretClient } from "./secret-client.ts";
import { join } from "node:path";
import { PackageList, loadPackages } from "../plugins/packages.ts";
import { builtin } from "@atelier/builtin-api/contracts";
import { DatabaseVersionError } from "./storage.ts";
import { EventPeer } from "./event-peer.ts";
import { CallPeer } from "./call-peer.ts";
import { callRuntimeControlSchema, pluginCallsVersion } from "../shared/plugin-calls.ts";
import { eventRuntimeControlSchema, pluginEventsVersion } from "../shared/plugin-events.ts";
import { bindPublicProvider } from "../shared/public-modules.ts";
import { builtinPublicProvider } from "../builtin-public.ts";
import { builtinRuntimePublicModules } from "../builtin-runtime-public.ts";

// 任务进程只接收主进程给出的应用数据根目录，不接受 renderer 文件路径。
const port = process.parentPort;
if (!port) throw new Error("The task runtime must be started as an Electron utility process.");
let service: ApplicationService;
const secrets = new SecretClient(message => port.postMessage(message));
const releasePublic = bindPublicProvider("runtime", builtinPublicProvider, builtinRuntimePublicModules);
try {
  const root = process.argv[2];
  if (!root) throw new Error("Application data directory is required.");
  // 插件包只在启动时解析、打包与导入；列表变化重启后生效。
  const packages = await loadPackages(new PackageList(join(root, "plugins.json")), join(root, "plugins"), join(root, "plugins", ".cache"), [builtin.id], [builtinPublicProvider])
    .catch(error => { console.error("Plugin packages could not be loaded.", error); return []; });
  for (const item of packages) if (item.error) console.error(`Plugin package ${item.root} is ${item.status}: ${item.error}`);
  const listed = packages.map(item => ({ enabled: item.entry.enabled, id: item.manifest?.id ?? null,
    source: item.entry.source.kind === "path" ? item.entry.source.path : `${item.entry.source.name}@${item.entry.source.version}`,
    status: item.status, error: item.error ?? null, renderer: item.status === "loaded" ? item.renderer ?? null : null,
    dependencies: item.dependencies ?? [], rendererDependencies: item.rendererDependencies ?? [] }));
  service = new ApplicationService(root, { catalogs: packages.flatMap(item => item.catalogs ?? []), packages: listed, plugins: packages.flatMap(item => item.definition ? [item.definition] : []), protector: secrets, onConfigurationChanged: () => port.postMessage({ kind: "configuration.changed" }),
    onSessionChanged: event => port.postMessage(event),
    onPluginConfigurationChanged: id => port.postMessage({ kind: "plugin-configuration.changed", id }),
    onStream: event => port.postMessage({ kind: "object.stream", ...event }) });
  const events = new EventPeer(service.sessions.events, frame => port.postMessage({ kind: "plugin-events.frame", version: pluginEventsVersion, frame }));
  const calls = new CallPeer(service.sessions.calls, frame => port.postMessage({ kind: "plugin-calls.frame", version: pluginCallsVersion, frame }));
  port.on("message", ({ data }) => {
    if (data?.kind === "shutdown") {
      events.close();
      calls.close();
      secrets.close();
      void service.close().finally(() => { releasePublic(); process.exit(0); });
      return;
    }
    if (secrets.receive(data)) return;
    if (data?.kind === "plugin-calls.control") {
      const parsed = callRuntimeControlSchema.safeParse(data);
      if (parsed.success) calls.receive(parsed.data.control);
      return;
    }
    if (data?.kind === "plugin-events.control") {
      const parsed = eventRuntimeControlSchema.safeParse(data);
      if (parsed.success) events.receive(parsed.data.control);
      return;
    }
    if (data?.kind === "content.request") {
      void dispatchContent(service, data).then(response => { if (response) port.postMessage(response); });
      return;
    }
    if (data?.kind === "plugin-configuration.request") {
      const response = dispatchPluginConfiguration(service, data);
      if (response) port.postMessage(response);
      return;
    }
    if (data?.kind === "session.request") {
      void dispatchSession(service, data).then(response => { if (response) port.postMessage(response); });
      return;
    }
    if (data?.kind === "configuration.request") {
      void dispatchConfiguration(service, data).then(response => { if (response) port.postMessage(response); });
      return;
    }
    const response = dispatch(service, data);
    if (response) port.postMessage(response);
  });
  port.postMessage({ kind: "ready", version: protocolVersion });
} catch (error) {
  releasePublic();
  console.error("Task runtime initialization failed.", error);
  port.postMessage(error instanceof DatabaseVersionError
    ? { kind: "fatal", reason: "database_version", message: error.message, directory: error.directory }
    : { kind: "fatal", reason: "unknown", message: "The workspace could not be opened. Check the application logs." });
  process.exitCode = 1;
}
