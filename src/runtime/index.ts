import { ApplicationService } from "./service.ts";
import { dispatch, dispatchConfiguration, dispatchSession } from "./dispatch.ts";
import { protocolVersion } from "../shared/contracts.ts";
import { SecretClient } from "./secret-client.ts";

// 任务进程只接收主进程给出的应用数据根目录，不接受 renderer 文件路径。
const port = process.parentPort;
if (!port) throw new Error("The task runtime must be started as an Electron utility process.");
let service: ApplicationService;
const secrets = new SecretClient(message => port.postMessage(message));
try {
  const root = process.argv[2];
  if (!root) throw new Error("Application data directory is required.");
  service = new ApplicationService(root, { protector: secrets, onConfigurationChanged: () => port.postMessage({ kind: "configuration.changed" }),
    onSessionChanged: event => port.postMessage(event) });
  port.on("message", ({ data }) => {
    if (data?.kind === "shutdown") {
      secrets.close();
      void service.close().finally(() => process.exit(0));
      return;
    }
    if (secrets.receive(data)) return;
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
  console.error("Task runtime initialization failed.", error);
  port.postMessage({ kind: "fatal", message: "The workspace could not be opened. Check the application logs." });
  process.exitCode = 1;
}
