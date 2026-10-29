import { z } from "zod";
import { coreChannel } from "./core.ts";

export const rendererFailureChannel = coreChannel("renderer-failure");
export const rendererFailureSchema = z.strictObject({
  stage: z.enum(["startup", "render"]),
  message: z.string(),
  stack: z.string().optional(),
  componentStack: z.string().optional(),
});
export type RendererFailure = z.infer<typeof rendererFailureSchema>;
