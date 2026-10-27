import { SubmitAgentInput } from "@asterism/builtin-api/contracts";
import { pluginNamespace } from "@asterism/sdk/contracts";
import { defineModule, definePlugin, implementPreparer } from "@asterism/sdk/runtime";

/** External plugins consume built-in action declarations; they neither declare a second Agent type nor import its implementation directory. */
export default definePlugin({
  namespace: pluginNamespace("example.input-review"),
  modules: [defineModule(plugin => ({
    preparers: [implementPreparer(SubmitAgentInput, {
      id: "review-input",
      prepare(input, { object }) {
        plugin.log.info(`Preparing ${input.parts.length} input parts for agent ${object.ref.id}.`);
        return { action: "accept" };
      },
    })],
  }))],
});
