/** Tool view author example: the three states are declared in parallel, and the same component can be reused across phases. */
import { createElement } from "react";
import { z } from "zod";
import { defineData, type Json } from "@asterism-app/sdk/contracts";
import { toolRenderer, type ToolRenderProps } from "@asterism-app/sdk/renderer";

const Result = defineData("example.writer/write", z.object({ written: z.number() }));
const targetSchema = z.object({ path: z.string() });
const argsSchema = z.object({ content: z.string() });
type Props = ToolRenderProps<z.infer<typeof Result.schema>, z.infer<typeof targetSchema>, z.infer<typeof argsSchema>>;

function inputContent(args: Json): string {
  return args !== null && typeof args === "object" && !Array.isArray(args) && typeof args.content === "string" ? args.content : "";
}

function Header(props: Props) {
  let path: string | undefined;
  if (props.phase === "input") {
    const target = props.target;
    if (target !== null && typeof target === "object" && !Array.isArray(target) && typeof target.path === "string") path = target.path;
  } else path = props.target.path;
  return createElement("span", null, path ?? "Write");
}
function Body(props: Props) {
  if (props.phase === "input") {
    return createElement("pre", null, inputContent(props.args).slice(-2_000));
  }
  return createElement("pre", null, props.result?.data?.written ?? props.args.content);
}
const view = { headerRenderer: Header, bodyRenderer: Body };
export const writerView = toolRenderer({ ...Result, targetSchema, tool: { argsSchema } }, {
  label: "Write",
  input: { ...view, streaming: ({ args }) => inputContent(args).length > 0 },
  execution: view, result: view,
});

/** Plugins render progressive output themselves; the shell manages automatic expansion and collapse based on declarations and user settings. */
const Report = defineData("example.writer/report", z.object({ text: z.string() }));
function ReportBody({ phase, result }: ToolRenderProps<z.infer<typeof Report.schema>>) {
  const text = result?.data?.text ?? "";
  return createElement("pre", null, phase === "executing" ? text.slice(-2_000) : text);
}
export const reportView = toolRenderer(Report, {
  label: "Report",
  execution: { bodyRenderer: ReportBody, streaming: ({ result }) => !!result?.data?.text },
  result: { bodyRenderer: ReportBody },
});
