import { z } from "zod";
import { modelInfoSchema } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const ListModelsResult = builtin.data("models.list", z.array(z.string())
  .describe("Flat provider/model expressions for configured models whose model and provider are enabled."));
export const GetModelResult = builtin.data("models.get", modelInfoSchema
  .describe("Configured model identity, name, context window, price table, maximum output tokens, and reasoning/tool capabilities. Null values mean unknown."));
