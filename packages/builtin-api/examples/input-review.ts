import { SubmitAgentInput } from "@atelier/builtin-api/contracts";
import { pluginNamespace } from "@atelier/sdk/contracts";
import { defineModule, definePlugin, implementPreparer } from "@atelier/sdk/runtime";

/** 外部插件消费内置动作声明；不声明第二种 Agent，也不导入其实现目录。 */
export default definePlugin({
  namespace: pluginNamespace("example.input-review"), version: "1.0.0",
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
