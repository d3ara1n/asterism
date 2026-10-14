import { CircleAlert, CircleCheck, Hand } from "lucide-react";
import type { ResourceStatus } from "@atelier/sdk/contracts";
import { useId } from "react";
import { resourceStatusMessages as messages } from "../messages/resource-status";
import { useI18n } from "../shared/i18n";
import { Button } from "../shared/ui/button";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "../shared/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "../shared/ui/popover";
import { Spinner } from "../shared/ui/spinner";
import { Progress } from "../shared/ui/progress";
import { summarizeResourceStatus, type ResourceStatusMark } from "./resource-status";

function StatusIcon({ status }: { status: ResourceStatus["status"] }) {
  if (status === "running") return <Spinner className="size-4 motion-reduce:animate-none" />;
  const Icon = status === "failed" ? CircleAlert : status === "awaiting" ? Hand : CircleCheck;
  return <Icon aria-hidden="true" className="size-4" />;
}

/** 独立于会话导航的状态入口；展开只查看条目，不消费标记。 */
export function SessionStatus({ marks }: { marks: readonly ResourceStatusMark[] }) {
  const i18n = useI18n(), titleId = useId();
  const status = summarizeResourceStatus(marks);
  if (!status) return null;
  const label = i18n.formatMessage(messages.summary, { status: i18n.text(messages[status]), count: marks.length });
  return <Popover>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="xs" aria-label={label} title={label}
        className="absolute right-8 top-1/2 -translate-y-1/2 gap-1">
        <StatusIcon status={status} />
        {marks.length > 1 && <span className="tabular-nums">{marks.length}</span>}
      </Button>
    </PopoverTrigger>
    <PopoverContent side="right" align="start" className="p-2" aria-labelledby={titleId}>
      <h2 id={titleId} className="type-label px-2 py-1">{i18n.text(messages.title)}</h2>
      <ItemGroup className="max-h-80 overflow-y-auto">
        {marks.map(mark => <Item key={mark.resource.id} size="sm" role="listitem">
          <ItemMedia><StatusIcon status={mark.status} /></ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="max-w-full"><span className="truncate" title={i18n.text(mark.title)}>{i18n.text(mark.title)}</span></ItemTitle>
            <ItemDescription>{i18n.text(messages[mark.status])}</ItemDescription>
            {mark.status === "running" && mark.progress && <Progress value={mark.progress.value * 100}
              aria-label={i18n.text(mark.title)} />}
          </ItemContent>
        </Item>)}
      </ItemGroup>
    </PopoverContent>
  </Popover>;
}
