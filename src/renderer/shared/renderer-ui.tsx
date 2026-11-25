import type { ToolResourceSubjectProps, ToolScrollAreaProps } from "@asterism-app/sdk/renderer";
import { HeaderExcerpt } from "@asterism-app/ui/header-excerpt";
import { StreamingScrollArea } from "@asterism-app/ui/streaming-scroll-area";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { ToolScrollArea as SharedToolScrollArea, useToolResourceSubject } from "@asterism-app/ui/tool-content";
import { Diff } from "@asterism-app/ui/code-view";

function ToolResourceSubject({ resource }: ToolResourceSubjectProps) {
  return <>{useToolResourceSubject(resource)}</>;
}

/** The default settled-result height budget. */
function ToolScrollArea({ children, label }: ToolScrollAreaProps) {
  return <SharedToolScrollArea className="max-h-80" viewportProps={{ role: "region", "aria-label": label }}>{children}</SharedToolScrollArea>;
}

/** Host implementations behind the SDK renderer's shared presentation controls. */
export const rendererUi = { HeaderExcerpt, StreamingScrollArea, ToolHeader, ToolResourceSubject, ToolScrollArea, Diff };
