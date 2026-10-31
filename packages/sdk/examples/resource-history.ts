import { ResourceCreated, ResourceRemoved, pluginNamespace } from "@asterism-app/sdk/contracts";
import { defineModule, definePlugin } from "@asterism-app/sdk/runtime";

/** Observe public resource facts independently of any resource implementation or Agent paradigm. */
export default definePlugin({
  namespace: pluginNamespace("example.resource-history"),
  modules: [defineModule(plugin => ({
    observers: [{
      id: "resource-history",
      committed({ records }) {
        for (const created of ResourceCreated.decodeAll(records)) {
          if (created.status === "unknown") {
            plugin.log.error(`Cannot decode creation record ${created.record.id}.`);
            continue;
          }
          const { id, type, title } = created.data;
          plugin.log.info(`Created ${type} resource ${id} in session ${created.record.sessionId}: ${title}`);
        }
        for (const removed of ResourceRemoved.decodeAll(records)) {
          if (removed.status === "unknown") {
            plugin.log.error(`Cannot decode removal record ${removed.record.id}.`);
            continue;
          }
          plugin.log.info(`Removed resource ${removed.data.id} from the current path.`);
        }
      },
    }],
  }))],
});
