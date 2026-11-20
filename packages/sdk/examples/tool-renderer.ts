/** Tool view author example: the three states are declared in parallel, and the same component can be reused across phases. */
import { createElement } from "react";
import { z } from "zod";
import { defineData, type Json } from "@asterism-app/sdk/contracts";
import { HeaderExcerpt, StreamingScrollArea, toolRenderer, type ToolRenderProps } from "@asterism-app/sdk/renderer";

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

/** Input context is stable while the report grows; execution and results render it in the same place. */
const Report = defineData("example.writer/report", z.object({ text: z.string() }));
const reportArgs = z.object({ question: z.string() });
type ReportProps = ToolRenderProps<z.infer<typeof Report.schema>, Json, z.infer<typeof reportArgs>>;
function ReportHeader({ args }: ReportProps) {
  const question = args !== null && typeof args === "object" && !Array.isArray(args) && typeof args.question === "string" ? args.question : "";
  // The excerpt belongs in a shrinkable title slot, not in a tooltip containing the complete question.
  return createElement(HeaderExcerpt, { text: question });
}
function ReportBody(props: ReportProps) {
  if (props.phase === "input") return null;
  const text = props.result?.data?.text;
  const status = props.phase === "settled" ? "No report" : "No report yet";
  return createElement("div", null,
    createElement("p", null, props.args.question),
    createElement(StreamingScrollArea, {
      label: "Report", initialScrollPosition: props.phase === "settled" ? "start" : "end",
      children: createElement("pre", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } }, text || status),
    }),
  );
}
export const reportView = toolRenderer({ ...Report, tool: { argsSchema: reportArgs } }, {
  label: "Report",
  input: { headerRenderer: ReportHeader },
  execution: { headerRenderer: ReportHeader, bodyRenderer: ReportBody, streaming: ({ result }) => !!result?.data?.text },
  result: { headerRenderer: ReportHeader, bodyRenderer: ReportBody },
});
