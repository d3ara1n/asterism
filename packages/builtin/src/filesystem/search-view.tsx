import type { ReactNode } from "react";
import { ChevronRight, FileSearch, Search } from "lucide-react";
import { toolRenderer, useI18n, useRendererViewState, type ToolRenderProps } from "@asterism/sdk/renderer";
import { ToolHeader } from "@asterism/ui/tool-header";
import { Button } from "@asterism/ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@asterism/ui/ui/collapsible";
import { cn } from "@asterism/ui/utils";
import { CodeRows } from "../code-view";
import { filesystemMessages as messages } from "../messages/filesystem";
import { textMessages } from "../messages/text";
import { inputText } from "../shared/tool-preview";
import { TOOL_BODY_LINE_LIMIT } from "../shared/tool-body";
import { DirectoryFind, DirectoryGrep, type FindResult, type GrepResult, type SearchStopReason } from "./search-contract";
import { searchSummary } from "./search-presentation";
import { displayPath, grepFiles, groupByDirectory, searchFilters, searchOptions, type DirectoryGroup, type GrepFile, type SearchOption } from "./search-layout";

type Props = ToolRenderProps<FindResult | GrepResult>;

const stopMessages = {
  limit: messages.toolSearchLimit,
  output_bytes: messages.toolSearchOutputBytes,
  record_bytes: messages.toolSearchRecordBytes,
} satisfies Record<Exclude<SearchStopReason, null>, typeof messages.toolSearchLimit>;
const flagMessages = {
  literal: messages.toolSearchOptionLiteral,
  ignoreCase: messages.toolSearchOptionIgnoreCase,
  word: messages.toolSearchOptionWord,
  hidden: messages.toolSearchOptionHidden,
  noIgnore: messages.toolSearchOptionNoIgnore,
} satisfies Record<Extract<SearchOption, { kind: "flag" }>["flag"], typeof messages.toolSearchLimit>;

/** 主体以搜索模式开头，范围（资源与非根路径）随后，截断时优先保留模式。 */
function Header(props: Props & { grep?: boolean }) {
  const i18n = useI18n(), data = props.result?.data;
  const path = inputText(props.target, "path");
  const scope = [props.invocation.resource?.title, path && path !== "." ? path : null].filter(Boolean).join(" / ");
  const counts = data && searchSummary(data);
  const truncated = counts ? !counts.complete : false;
  return <ToolHeader label={i18n.text(props.grep ? messages.toolDirectoryGrep : messages.toolDirectoryFind)} monospace
    subject={[inputText(props.args, "pattern"), scope].filter(Boolean).join(" · ")}
    meta={counts && [
      counts.matches !== null && i18n.formatMessage(messages.toolSearchMatches, { count: counts.matches, truncated }),
      i18n.formatMessage(messages.toolSearchFiles, { count: counts.files, truncated }),
    ].filter(Boolean).join(" · ")} />;
}
function FindHeader(props: ToolRenderProps<FindResult>) { return <Header {...props} />; }
function GrepHeader(props: ToolRenderProps<GrepResult>) { return <Header {...props} grep />; }

function Options({ args }: { args: Props["args"] }) {
  const i18n = useI18n();
  const options = searchOptions(args);
  if (!options.length) return null;
  const label = (option: SearchOption): ReactNode => {
    switch (option.kind) {
      case "mode": return i18n.text(option.value === "files" ? messages.toolSearchOptionFiles : messages.toolSearchOptionCount);
      case "flag": return i18n.text(flagMessages[option.flag]);
      case "context": return i18n.formatMessage(messages.toolSearchOptionContext, { count: option.value });
      case "limit": return i18n.formatMessage(messages.toolSearchOptionLimit, { count: option.value });
      case "glob": return <span className="font-mono">{option.value}</span>;
    }
  };
  return <p className="type-caption break-all text-muted-foreground">
    {options.map((option, index) => <span key={index}>{index > 0 && " · "}{label(option)}</span>)}
  </p>;
}

/** 扁平目录分组：目录标题使用次要文字，其下条目缩进；根层条目不设标题。 */
function DirectoryGroups<T>({ groups, children }: { groups: DirectoryGroup<T>[]; children: (entry: { name: string; item: T }) => ReactNode }) {
  return <div className="flex flex-col gap-1.5">
    {groups.map(group => <div key={group.directory} className="flex flex-col">
      {group.directory && <p className="type-caption break-all font-mono text-muted-foreground">{group.directory}/</p>}
      <ul className={cn("type-code flex flex-col", group.directory && "pl-3")}>
        {group.entries.map(entry => <li key={entry.name} className="min-w-0">{children(entry)}</li>)}
      </ul>
    </div>)}
  </div>;
}

/** 文件行可展开查看命中片段；开合按文件路径保存在对话条目视图状态中，代码片段只在展开时挂载。 */
function GrepFileRow({ file, name, initialOpen }: { file: GrepFile; name: string; initialOpen: boolean }) {
  const i18n = useI18n();
  const [open, setOpen] = useRendererViewState(`asterism.builtin/search-file:${file.path}`, initialOpen);
  return <Collapsible open={open} onOpenChange={setOpen}>
    <CollapsibleTrigger asChild>
      <Button variant="ghost" size="xs" className="h-auto min-h-6 w-full justify-start px-1 font-mono font-normal">
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-90")} />
        <span className="min-w-0 truncate" title={file.path}>{name}</span>
        <span className="ml-auto shrink-0 type-caption tabular-nums text-muted-foreground">{file.matches}</span>
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent className="flex flex-col gap-2 py-1.5 pl-5">
      {open && <>
        {file.segments.map(segment => <CodeRows key={segment.rows[0].line} rows={segment.rows} filename={file.path} overflow="scroll"
          dimmed={segment.rows.flatMap((row, index) => row.match ? [] : [index])} />)}
        {file.omitted > 0 && <p className="type-caption">{i18n.formatMessage(textMessages.toolTextPreviewOmitted, { count: file.omitted })}</p>}
      </>}
    </CollapsibleContent>
  </Collapsible>;
}

function Results({ data, args }: { data: FindResult | GrepResult; args: Props["args"] }) {
  const i18n = useI18n();
  const path = (value: string) => displayPath(data.path, value);
  const summary = searchSummary(data);
  const filters = searchFilters(args);
  let content: ReactNode, omitted = 0;
  if ("rows" in data && data.mode === "content") {
    const files = grepFiles(data.rows, TOOL_BODY_LINE_LIMIT);
    const grouped = groupByDirectory(files, file => path(file.path), TOOL_BODY_LINE_LIMIT);
    omitted = grouped.omitted;
    content = <DirectoryGroups groups={grouped.groups}>
      {({ name, item }) => <GrepFileRow file={item} name={name} initialOpen={files.length === 1} />}
    </DirectoryGroups>;
  } else if ("rows" in data) {
    const grouped = groupByDirectory(data.files, file => path(file.path), TOOL_BODY_LINE_LIMIT);
    omitted = grouped.omitted;
    content = <DirectoryGroups groups={grouped.groups}>
      {({ name, item }) => <div className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 break-all">{name}</span>
        {item.count !== null && <span className="ml-auto shrink-0 type-caption tabular-nums text-muted-foreground">{item.count}</span>}
      </div>}
    </DirectoryGroups>;
  } else {
    const grouped = groupByDirectory(data.files, path, TOOL_BODY_LINE_LIMIT);
    omitted = grouped.omitted;
    content = <DirectoryGroups groups={grouped.groups}>{({ name }) => <span className="break-all">{name}</span>}</DirectoryGroups>;
  }
  return <>
    {summary.empty === null ? content : <p className="type-caption">{i18n.text(summary.empty === "incomplete"
      ? messages.toolSearchEmptyIncomplete : summary.unit === "rows" ? messages.toolSearchNoLines : messages.directoryNoMatches)}</p>}
    {summary.empty === "no_matches" && filters && <p className="type-caption text-muted-foreground">
      {i18n.formatMessage(messages.toolSearchFiltered, { filters })}</p>}
    {omitted > 0 && <p className="type-caption">{i18n.formatMessage(messages.toolSearchFilesOmitted, { count: omitted })}</p>}
    {data.stopReason !== null && <p className="type-caption">{i18n.formatMessage(stopMessages[data.stopReason], { unit: summary.unit })}</p>}
  </>;
}

/** 执行中与终结共用：先列出偏离默认值的参数，结果到达后追加分组结果。 */
function Body({ args, result }: Props) {
  const data = result?.data;
  const options = searchOptions(args);
  if (!data && !options.length) return null;
  return <div className="flex flex-col gap-2">
    <Options args={args} />
    {data && <Results data={data} args={args} />}
  </div>;
}

export const findViews = {
  input: { headerRenderer: FindHeader },
  execution: { headerRenderer: FindHeader, bodyRenderer: Body },
  result: { headerRenderer: FindHeader, bodyRenderer: Body },
};
export const grepViews = {
  input: { headerRenderer: GrepHeader },
  execution: { headerRenderer: GrepHeader, bodyRenderer: Body },
  result: { headerRenderer: GrepHeader, bodyRenderer: Body },
};

export const searchToolRenderers = [
  toolRenderer(DirectoryFind, {
    label: messages.toolDirectoryFind, icon: <FileSearch className="size-3.5" />,
    ...findViews,
  }),
  toolRenderer(DirectoryGrep, {
    label: messages.toolDirectoryGrep, icon: <Search className="size-3.5" />,
    ...grepViews,
  }),
];
