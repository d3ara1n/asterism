import { ApplicationService } from "./service.ts";
import { dispatch } from "./dispatch.ts";
import { protocolVersion } from "../shared/contracts.ts";

// 任务进程只接收主进程给出的应用数据根目录，不接受 renderer 文件路径。
const port = process.parentPort;
if (!port) throw new Error("The task runtime must be started as an Electron utility process.");
let service: ApplicationService;
try {
  const root = process.argv[2];
  if (!root) throw new Error("Application data directory is required.");
  service = new ApplicationService(root);
  port.on("message", ({ data }) => {
    if (data?.kind === "shutdown") {
      service.close();
      process.exit(0);
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
