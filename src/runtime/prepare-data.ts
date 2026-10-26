import { prepareApplicationData, restoreApplicationData, startFreshApplicationData } from "../storage/application.ts";
import { clearPause } from "../storage/preparation.ts";
import type { PreparationMessage } from "../shared/recovery.ts";

/** 独立准备进程在业务运行时之前结束；其数据库连接不跨进程交付。参数：数据根、应用版本、操作及还原目标。 */
const port = process.parentPort;
if (!port) throw new Error("Data preparation requires an Electron utility process.");
const post = (message: PreparationMessage) => port.postMessage(message);
const [root, version, action = "prepare", point] = process.argv.slice(2);
try {
  if (!root || !version) throw new Error("Data preparation requires the data directory and application version.");
  if (action === "prepare") {
    post({ kind: "result", result: await prepareApplicationData(root, version, status => post({ kind: "host", status })) });
  } else {
    if (action === "retry") clearPause(root);
    else if (action === "fresh") startFreshApplicationData(root, version);
    else if (action === "restore" && point) restoreApplicationData(root, point, version);
    else throw new Error(`Unknown data preparation action: ${action}.`);
    post({ kind: "result", result: { ok: true, plugins: [] } });
  }
} catch (error) {
  console.error("Data preparation failed.", error);
  post({ kind: "error", error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
