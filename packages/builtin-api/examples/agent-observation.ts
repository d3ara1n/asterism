import { Agent, AgentInputAccepted, AgentInputMessage, AgentTurnEnded } from "@asterism-app/builtin-api/contracts";
import { pluginNamespace, ResourceCreated } from "@asterism-app/sdk/contracts";
import { defineModule, definePlugin } from "@asterism-app/sdk/runtime";

/** A plugin can observe Agents without declaring a resource of its own. */
export default definePlugin({
  namespace: pluginNamespace("example.agent-observation"),
  modules: [defineModule(plugin => {
    const options = { source: { resourceKind: Agent.kind }, signal: plugin.lifetime.signal };
    plugin.ipc.events.subscribe(AgentInputAccepted, options, ({ source, data }) => {
      // The payload is the final prepared input, accepted once for this submission identity.
      plugin.log.info(`Agent ${source!.resource!.id} accepted ${data.input.submissionId}; queued=${data.queued}.`);
    });
    plugin.ipc.events.subscribe(AgentTurnEnded, options, ({ source, data }) => {
      plugin.log.info(`Agent ${source!.resource!.id} ended turn ${data.inputId}: ${data.reason}; settled=${data.settled}.`);
      if (data.settled) {
        // position identifies this ending even if another execution has started by the time this callback runs.
        plugin.log.info(`Execution ended at history position ${data.position.nodeId}.`);
      }
    });
    return {
      observers: [{
        id: "agent-records",
        committed({ records }) {
          for (const created of ResourceCreated.decodeAll(records)) {
            if (created.status === "unknown") {
              plugin.log.error(`Cannot decode resource creation record ${created.record.id}.`);
              continue;
            }
            if (created.data.type === Agent.kind)
              plugin.log.info(`Agent ${created.data.id} was created as ${created.data.title}.`);
          }
          for (const message of AgentInputMessage.decodeAll(records)) {
            if (message.status === "unknown") {
              plugin.log.error(`Cannot decode Agent input record ${message.record.id}.`);
              continue;
            }
            // This record is now part of model context. Steering is delivered with startsTurn=false.
            plugin.log.info(`Agent ${message.record.source!.resource!.id} received ${message.data.sender.kind} input ${message.record.id}; startsTurn=${message.data.startsTurn}.`);
          }
        },
      }],
    };
  })],
});
