/** 工具视图作者用例：三态平行声明，同一组件可以跨阶段复用。 */
import { createElement } from "react";
import { z } from "zod";
import { defineData } from "@atelier/sdk/contracts";
import { toolRenderer, type ToolRenderProps, type ToolRendererDefinition } from "@atelier/sdk/renderer";

const Result = defineData("example.writer/write", z.object({ written: z.number() }));
const targetSchema = z.object({ path: z.string() });
const argsSchema = z.object({ content: z.string() });
type Props = ToolRenderProps<z.infer<typeof Result.schema>, z.infer<typeof targetSchema>, z.infer<typeof argsSchema>>;

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
    const args = props.args;
    const content = args !== null && typeof args === "object" && !Array.isArray(args) && typeof args.content === "string" ? args.content : "";
    return createElement("pre", null, content.slice(-2_000));
  }
  return createElement("pre", null, props.result?.data?.written ?? props.args.content);
}
const view = { headerRenderer: Header, bodyRenderer: Body };
export const writerView = toolRenderer({ ...Result, targetSchema, tool: { argsSchema } }, {
  label: "Write", input: view, execution: view, result: view,
});

export const checkedStages = {
  input: {
    headerRenderer(props) {
      // @ts-expect-error 部分 JSON 不是已校验的 target，必须先收窄类型。
      props.target.path;
      // @ts-expect-error 填充期没有执行结果。
      props.result.data;
      return null;
    },
  },
  execution: {
    headerRenderer(props) {
      props.target.path.toUpperCase();
      props.args.content.length;
      // @ts-expect-error 等待与执行期尚无终结结局。
      const terminal: "succeeded" = props.result?.kind;
      return terminal;
    },
  },
  result: {
    headerRenderer(props) {
      const terminal = props.result.kind;
      // @ts-expect-error 结果视图不可能收到运行中产出。
      const running: "running" = terminal;
      return running;
    },
  },
} satisfies ToolRendererDefinition<z.infer<typeof Result.schema>, z.infer<typeof targetSchema>, z.infer<typeof argsSchema>>;
