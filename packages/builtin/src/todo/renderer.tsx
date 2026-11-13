import { cardRenderer, creationEntry, toolRenderer, type RendererModule, type ToolResultRenderProps } from "@asterism-app/sdk/renderer";
import { ListTodo, FileText, Search, Pencil, Plus, Check, UserRoundCheck, Undo2, Trash2 } from "lucide-react";
import type { z } from "zod";
import { prepareCodeView } from "@asterism-app/ui/code-view";
import { todoMessages as messages } from "../messages/todo";
import { todoListCard as appearance } from "../shared/card-appearance";
import { textReadViews, textWriteViews, textEditViews } from "../text-view";
import { BrowseTodoLists, CreateSharedTodoList, DeleteSharedTodoList, TodoListResource, TodoListView, CreateTodoListResource, TodoListItems, TodoRead, TodoGrep, TodoWrite, TodoEdit,
  TodoCreate, TodoClaim, TodoRelease, TodoComplete, TodoReopen, TodoDelete } from "./contract";
import { TodoListCard } from "./TodoListCard";
import { TodoListInput } from "./creation";

// A Todo read wraps TextRead alongside metadata; only the content rows belong to the code viewer.
function ReadBody(props: ToolResultRenderProps<z.output<typeof TodoRead.schema>>) {
  const Body = textReadViews.result.bodyRenderer;
  return <div className="flex flex-col gap-2">
    {props.result.data && <p className="type-label">{props.result.data.todo.title}</p>}
    <Body {...props} result={{ ...props.result, data: props.result.data?.content ?? null }} />
  </div>;
}
export default {
  prepare: prepareCodeView,
  resources: [{ kind: TodoListResource.kind, label: messages.list, icon: <ListTodo className="size-4" />, card: appearance }],
  cards: [cardRenderer(TodoListView, { ...appearance, Body: TodoListCard })],
  creations: [creationEntry(CreateTodoListResource, { id: CreateTodoListResource.id, label: messages.list, icon: <ListTodo className="size-4" />,
    group: "resources", InputView: TodoListInput, triggers: { menu: {} } })],
  tools: [
    toolRenderer({ id: BrowseTodoLists.id, schema: BrowseTodoLists.output }, { label: messages.sharedList, icon: <ListTodo className="size-3.5" /> }),
    toolRenderer({ id: CreateSharedTodoList.id, schema: CreateSharedTodoList.output }, { label: messages.newList, icon: <Plus className="size-3.5" /> }),
    toolRenderer({ id: DeleteSharedTodoList.id, schema: DeleteSharedTodoList.output }, { label: messages.deleteList, icon: <Trash2 className="size-3.5" /> }),
    toolRenderer(TodoListItems, { label: messages.list, icon: <ListTodo className="size-3.5" /> }),
    toolRenderer(TodoRead, { label: messages.read, icon: <FileText className="size-3.5" />, result: { bodyRenderer: ReadBody } }),
    toolRenderer(TodoGrep, { label: messages.search, icon: <Search className="size-3.5" /> }),
    toolRenderer(TodoWrite, { label: messages.write, icon: <Pencil className="size-3.5" />, ...textWriteViews }),
    toolRenderer(TodoEdit, { label: messages.edit, icon: <Pencil className="size-3.5" />, ...textEditViews }),
    toolRenderer(TodoCreate, { label: messages.newTask, icon: <Plus className="size-3.5" /> }),
    toolRenderer(TodoClaim, { label: messages.claim, icon: <UserRoundCheck className="size-3.5" /> }),
    toolRenderer(TodoRelease, { label: messages.release, icon: <Undo2 className="size-3.5" /> }),
    toolRenderer(TodoComplete, { label: messages.complete, icon: <Check className="size-3.5" /> }),
    toolRenderer(TodoReopen, { label: messages.reopen, icon: <Undo2 className="size-3.5" /> }),
    toolRenderer(TodoDelete, { label: messages.deleteTask, icon: <Trash2 className="size-3.5" /> }),
  ],
} satisfies RendererModule;
