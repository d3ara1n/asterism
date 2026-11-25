import type { ToolResourceSubjectProps, ToolScrollAreaProps, CodeDiffProps } from "@asterism-app/sdk/renderer";
import { HeaderExcerpt } from "@asterism-app/ui/header-excerpt";
import { StreamingScrollArea } from "@asterism-app/ui/streaming-scroll-area";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { ToolScrollArea as SharedToolScrollArea, useToolResourceSubject } from "@asterism-app/ui/tool-content";
import { CodeDiff as SharedCodeDiff } from "@asterism-app/ui/code-view";

function ToolResourceSubject({ resource }: ToolResourceSubjectProps) {
  return <>{useToolResourceSubject(resource)}</>;
}

/** The host's settled-result height budget; plugins do not choose their own. */
function ToolScrollArea({ children, label }: ToolScrollAreaProps) {
  return <SharedToolScrollArea className="max-h-80" viewportProps={{ role: "region", "aria-label": label }}>{children}</SharedToolScrollArea>;
}

function CodeDiff({ diff, lineNumbers }: CodeDiffProps) {
  return <SharedCodeDiff diff={diff} lineNumbers={lineNumbers} />;
}

/** Host implementations behind the SDK renderer's shared presentation controls. */
export const rendererUi = { HeaderExcerpt, StreamingScrollArea, ToolHeader, ToolResourceSubject, ToolScrollArea, CodeDiff };
