/** Tool view author example: the three states are declared in parallel, and the same component can be reused across phases. */
import { createElement } from "react";
import { z } from "zod";
import { defineData, type Json } from "@asterism-app/sdk/contracts";
import { toolRenderer, type ToolRenderProps, type ToolRendererDefinition } from "@asterism-app/sdk/renderer";

const Result = defineData("example.writer/write", z.object({ written: z.number() }));
const targetSchema = z.object({ path: z.string() });
const argsSchema = z.object({ content: z.string() });
export const checkedStages = {
  input: {
    headerRenderer(props) {
      // @ts-expect-error Partial JSON is not a validated target; narrow the type first.
      props.target.path;
      // @ts-expect-error No execution result exists during input streaming.
      props.result.data;
      return null;
    },
  },
  execution: {
    headerRenderer(props) {
      props.target.path.toUpperCase();
      props.args.content.length;
      // @ts-expect-error Waiting and execution phases do not yet have a final outcome.
      const terminal: "succeeded" = props.result?.kind;
      return terminal;
    },
  },
  result: {
    headerRenderer(props) {
      const terminal = props.result.kind;
      // @ts-expect-error Result views cannot receive output from ongoing execution.
      const running: "running" = terminal;
      return running;
    },
  },
} satisfies ToolRendererDefinition<z.infer<typeof Result.schema>, z.infer<typeof targetSchema>, z.infer<typeof argsSchema>>;
