import { prepareApplicationData } from "../storage/application.ts";
import { acknowledgeMigration, readMigrationReport, recoverData } from "../storage/preparation.ts";

/** 独立准备进程在主窗口与业务运行时之前结束；其数据库连接不跨进程交付。 */
const port = process.parentPort;
if (!port) throw new Error("Data preparation requires an Electron utility process.");
const [root, version, action = "prepare"] = process.argv.slice(2);
try {
  if (!root || !version) throw new Error("Data preparation requires the data directory and application version.");
  if (action === "restore" || action === "fresh") {
    recoverData(root, action);
    port.postMessage({ ok: true, report: readMigrationReport(root) });
  } else if (action === "acknowledge") {
    acknowledgeMigration(root);
    port.postMessage({ ok: true, report: readMigrationReport(root) });
  } else {
    port.postMessage(await prepareApplicationData(root, version, action === "retry"));
  }
} catch (error) {
  console.error("Data preparation failed.", error);
  port.postMessage({ error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
