import { recordRenderer, type RendererModule } from "@asterism-app/sdk/renderer";
import { withValues, SessionTitleAssigned } from "@asterism-app/sdk/contracts";
import { Link, Unlink, Plus, Minus, PanelsTopLeft, PenLine } from "lucide-react";

import { historyMessages } from "../../messages/history";
import { ResourceCreated, ResourceRenamed, ObjectAdded, ObjectRemoved, ResourceAttached, ResourceDetached } from "../../../shared/workbench-records";

/** History views for host workbench events; use the same registry as plugin records. */
export const workbenchRecordViews: RendererModule = {
  resources: [], cards: [], tools: [],
  records: [
    recordRenderer(SessionTitleAssigned, { icon: <PenLine className="size-4" />,
      label: data => withValues(historyMessages.eventRenamed, { title: data.title }) }),
    recordRenderer(ResourceCreated, { icon: <PanelsTopLeft className="size-4" />,
      label: (data, ctx) => withValues(historyMessages.eventCreated, { kind: ctx.text(ctx.resourceLabel(data.type)), title: ctx.resourceTitle(data.id) }) }),
    recordRenderer(ResourceRenamed, { icon: <PenLine className="size-4" />,
      label: data => withValues(historyMessages.eventRenamed, { title: data.title }) }),
    recordRenderer(ObjectAdded, { icon: <Plus className="size-4" />, label: (data, ctx) => withValues(historyMessages.eventAdded, { title: ctx.resourceTitle(data.id) }) }),
    recordRenderer(ObjectRemoved, { icon: <Minus className="size-4" />, label: (data, ctx) => withValues(historyMessages.eventRemoved, { title: ctx.resourceTitle(data.id) }) }),
    recordRenderer(ResourceAttached, { icon: <Link className="size-4" />, label: (data, ctx) =>
      withValues(historyMessages.eventLinked, { resource: ctx.resourceTitle(data.id), receiver: ctx.resourceTitle(data.receiverId) }) }),
    recordRenderer(ResourceDetached, { icon: <Unlink className="size-4" />, label: (data, ctx) =>
      withValues(historyMessages.eventDetached, { resource: ctx.resourceTitle(data.id), receiver: ctx.resourceTitle(data.receiverId) }) }),
  ],
};
