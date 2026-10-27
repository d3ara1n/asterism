import type { z } from "zod";
import { BookOpen, RefreshCw } from "lucide-react";
import { toolRenderer, useI18n, type RendererModule, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { CodeRows } from "../code-view";
import { prepareCodeView } from "../shared/code-view";
import { inputField, inputText } from "../shared/tool-preview";
import { displayText } from "../shared/text-row";
import { skillsMessages } from "../messages/skills";
import { SkillRead, SkillRefresh } from "./contract";

type ReadProps = ToolRenderProps<z.infer<typeof SkillRead.schema>>;
type RefreshProps = ToolRenderProps<z.infer<typeof SkillRefresh.schema>>;

function SkillReadHeader({ args, result }: ReadProps) {
  const name = result?.data?.name ?? inputText(args, "name") ?? "";
  const path = result?.data?.path ?? inputText(args, "path") ?? "SKILL.md";
  const offset = inputField(args, "offset"), limit = inputField(args, "limit");
  return <ToolHeader label={name} subject={path} monospace
    meta={`offset ${typeof offset === "number" ? offset : 1} · limit ${typeof limit === "number" ? limit : 1000}`} />;
}
function SkillReadBody({ result }: ReadProps) {
  const data = result?.data;
  return data ? <CodeRows rows={data.rows.map(row => ({ line: row.line, content: displayText(row) }))} filename={data.path} /> : null;
}
function RefreshHeader({ result }: RefreshProps) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.text(skillsMessages.refresh)}
    meta={result?.data && i18n.formatMessage(skillsMessages.count, { count: result.data.count })} />;
}
/** Refresh results save only skill counts and discovery issues; the full catalog is available in settings. */
function RefreshBody({ result }: RefreshProps) {
  const data = result?.data;
  return data?.issues.length ? <div className="space-y-1">
    {data.issues.map((issue, index) => <p key={index} className="type-caption break-all text-destructive select-text">{issue.file}: {issue.message}</p>)}
  </div> : null;
}
const readHeader = { headerRenderer: SkillReadHeader };
const refreshHeader = { headerRenderer: RefreshHeader };

export default {
  resources: [], cards: [],
  prepare: prepareCodeView,
  tools: [toolRenderer(SkillRead, {
    label: skillsMessages.read, icon: <BookOpen className="size-3.5" />,
    input: readHeader, execution: readHeader, result: { ...readHeader, bodyRenderer: SkillReadBody },
  }), toolRenderer(SkillRefresh, {
    label: skillsMessages.refresh, icon: <RefreshCw className="size-3.5" />,
    input: refreshHeader, execution: refreshHeader, result: { ...refreshHeader, bodyRenderer: RefreshBody },
  })],
} satisfies RendererModule;
