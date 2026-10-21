import { recordRenderer, type RendererModule } from "@atelier/sdk/renderer";
import { withValues } from "@atelier/sdk/contracts";
import { Link, Unlink, Plus, Minus, PanelsTopLeft } from "lucide-react";

import { historyMessages } from "../../messages/history";
import { ResourceCreated, ObjectAdded, ObjectRemoved, ResourceAttached, ResourceDetached } from "../../../shared/workbench-records";

/** 宿主工作台事件的历史视图；与插件记录走同一注册表。 */
export const workbenchRecordViews: RendererModule = {
  resources: [], cards: [], tools: [],
  records: [
    recordRenderer(ResourceCreated, { icon: <PanelsTopLeft className="size-4" />,
      label: (data, ctx) => withValues(historyMessages.eventCreated, { kind: ctx.text(ctx.resourceLabel(data.type)), title: ctx.resourceTitle(data.id) }) }),
    recordRenderer(ObjectAdded, { icon: <Plus className="size-4" />, label: (data, ctx) => withValues(historyMessages.eventAdded, { title: ctx.resourceTitle(data.id) }) }),
    recordRenderer(ObjectRemoved, { icon: <Minus className="size-4" />, label: (data, ctx) => withValues(historyMessages.eventRemoved, { title: ctx.resourceTitle(data.id) }) }),
    recordRenderer(ResourceAttached, { icon: <Link className="size-4" />, label: (data, ctx) =>
      withValues(historyMessages.eventLinked, { resource: ctx.resourceTitle(data.id), receiver: ctx.resourceTitle(data.receiverId) }) }),
    recordRenderer(ResourceDetached, { icon: <Unlink className="size-4" />, label: (data, ctx) =>
      withValues(historyMessages.eventDetached, { resource: ctx.resourceTitle(data.id), receiver: ctx.resourceTitle(data.receiverId) }) }),
  ],
};
