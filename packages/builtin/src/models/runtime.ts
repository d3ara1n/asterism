import { z } from "zod";
import { modelExpressionSchema } from "@asterism-app/sdk/contracts";
import { defineModule, defineTopLevelTool } from "@asterism-app/sdk/runtime";
import { GetModelResult, ListModelsResult } from "./contract.ts";

export default defineModule(plugin => ({
  topLevelTools: [
    defineTopLevelTool({
      id: ListModelsResult.id, name: "list_models",
      description: "List configured, enabled models as a flat JSON array of provider/model strings.",
      guidelines: [
        "Both the model and its provider are enabled. Listing reads local configuration without checking credentials or connectivity.",
        "Each string can be passed unchanged as get_model.model or used as a model expression in resource configuration.",
      ],
      argsSchema: z.strictObject({}).describe("Empty parameter object."),
      resultSchema: ListModelsResult.schema, effect: "read", execution: "parallel",
      async execute(_args, { signal }) {
        signal.throwIfAborted();
        return { kind: "succeeded", data: plugin.models.list().map(model => model.model) };
      },
    }),
    defineTopLevelTool({
      id: GetModelResult.id, name: "get_model",
      description: "Read configured metadata for one enabled model by its provider/model expression.",
      guidelines: [
        "model is an exact string from list_models. The first slash separates the provider ID from the model ID; the model ID can contain further slashes.",
        "Returns local metadata, including configured USD prices and maximum output tokens; null means unknown. No model request or provider discovery is performed.",
        "Unknown models and models with a disabled model or provider return not_found.",
      ],
      argsSchema: z.strictObject({
        model: modelExpressionSchema.describe("Exact provider/model expression returned by list_models."),
      }).describe("The model whose configured metadata to read."),
      resultSchema: GetModelResult.schema, effect: "read", execution: "parallel",
      async execute({ model }, { signal }) {
        signal.throwIfAborted();
        const info = plugin.models.list().find(entry => entry.model === model);
        return info ? { kind: "succeeded", data: info }
          : { kind: "rejected", error: { code: "not_found", message: `No enabled model ${JSON.stringify(model)} is configured. list_models returns available model expressions.` } };
      },
    }),
  ],
}));
