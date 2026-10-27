import { Hand } from "lucide-react";
import type { ResourceStatus } from "@asterism/sdk/contracts";
import { useId } from "react";
import { resourceStatusMessages as messages } from "../messages/resource-status";
import { useI18n } from "../shared/i18n";
import { Button } from "@asterism/ui/ui/button";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@asterism/ui/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@asterism/ui/ui/popover";
import { StatusIcon as SharedStatusIcon, type StatusTone } from "@asterism/ui/ui/status";
import { Progress } from "@asterism/ui/ui/progress";
import { summarizeResourceStatus, type ResourceStatusMark } from "./resource-status";

const tones: Record<ResourceStatus["status"], StatusTone> = { running: "progress", failed: "error", awaiting: "warning", completed: "success" };
function StatusIcon({ status }: { status: ResourceStatus["status"] }) {
  return <SharedStatusIcon tone={tones[status]} icon={status === "awaiting" ? Hand : undefined} className="size-4" />;
}

/** State entry independent of session navigation; expanding only views entries and does not consume markers. */
export function SessionStatus({ marks }: { marks: readonly ResourceStatusMark[] }) {
  const i18n = useI18n(), titleId = useId();
  const status = summarizeResourceStatus(marks);
  if (!status) return null;
  const label = i18n.formatMessage(messages.summary, { status: i18n.text(messages[status]), count: marks.length });
  return <Popover>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="xs" aria-label={label} title={label}
        className="shrink-0 gap-1">
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
