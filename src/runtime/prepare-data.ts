import { prepareApplicationData, restoreApplicationData, startFreshApplicationData } from "../storage/application.ts";
import { clearPause } from "../storage/preparation.ts";
import type { PreparationMessage } from "../shared/recovery.ts";

/** 提交与清理结束后发送最终结果，主进程收到后终止本进程。参数：数据根、应用版本、操作及还原目标。 */
const port = process.parentPort;
if (!port) throw new Error("Data preparation requires an Electron utility process.");
const post = (message: PreparationMessage) => port.postMessage(message);
const [root, version, action = "prepare", point] = process.argv.slice(2);
let terminal: PreparationMessage;
try {
  if (!root || !version) throw new Error("Data preparation requires the data directory and application version.");
  if (action === "prepare") {
    terminal = { kind: "result", result: await prepareApplicationData(root, version,
      status => post({ kind: "host", status }), progress => post({ kind: "progress", ...progress })) };
  } else {
    if (action === "retry") clearPause(root);
    else if (action === "fresh") startFreshApplicationData(root, version);
    else if (action === "restore" && point) restoreApplicationData(root, point, version);
    else throw new Error(`Unknown data preparation action: ${action}.`);
    terminal = { kind: "result", result: { ok: true, plugins: [] } };
  }
} catch (error) {
  console.error("Data preparation failed.", error);
  terminal = { kind: "error", error: error instanceof Error ? error.message : String(error) };
}
// 主进程收到结果即可终止本进程；先将最后的诊断输出交给管道。
await Promise.all([process.stdout, process.stderr].map(stream => new Promise<void>(resolve => stream.write("", () => resolve()))));
post(terminal);
