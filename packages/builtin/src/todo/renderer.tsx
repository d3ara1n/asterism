import { cardRenderer, creationEntry, toolRenderer, type RendererModule } from "@asterism-app/sdk/renderer";
import { ListTodo, FileText, Search, Pencil, Plus, Check, UserRoundCheck, Undo2, Trash2, ListPlus, RotateCcw } from "lucide-react";
import { prepareCodeView } from "@asterism-app/ui/code-view";
import { todoMessages as messages } from "../messages/todo";
import { todoListCard as appearance } from "../shared/card-appearance";
import { textWriteViews, textEditViews } from "../text-view";
import { BrowseTodoLists, CreateSharedTodoList, DeleteSharedTodoList, TodoListResource, TodoListView, CreateTodoListResource, TodoListItems, TodoRead, TodoGrep, TodoWrite, TodoEdit,
  TodoCreate, TodoClaim, TodoRelease, TodoComplete, TodoReopen, TodoDelete } from "./contract";
import { TodoListCard } from "./TodoListCard";
import { TodoListInput } from "./creation";
import { claimViews, completeViews, createListViews, createViews, deleteListViews, deleteViews, grepViews, listsViews, pageViews,
  readViews, releaseViews, reopenViews } from "./tool-views";

export default {
  prepare: prepareCodeView,
  resources: [{ kind: TodoListResource.kind, label: messages.list, icon: <ListTodo className="size-4" />, card: appearance }],
  cards: [cardRenderer(TodoListView, { ...appearance, Body: TodoListCard })],
  creations: [creationEntry(CreateTodoListResource, { id: CreateTodoListResource.id, label: messages.list, icon: <ListTodo className="size-4" />,
    group: "resources", InputView: TodoListInput, triggers: { menu: {} } })],
  tools: [
    toolRenderer({ id: BrowseTodoLists.id, schema: BrowseTodoLists.output }, { label: messages.sharedLists, icon: <ListTodo className="size-3.5" />, ...listsViews }),
    toolRenderer({ id: CreateSharedTodoList.id, schema: CreateSharedTodoList.output }, { label: messages.newList, icon: <ListPlus className="size-3.5" />, ...createListViews }),
    toolRenderer({ id: DeleteSharedTodoList.id, schema: DeleteSharedTodoList.output }, { label: messages.deleteList, icon: <Trash2 className="size-3.5" />, ...deleteListViews }),
    toolRenderer(TodoListItems, { label: messages.listTasks, icon: <ListTodo className="size-3.5" />, ...pageViews }),
    toolRenderer(TodoRead, { label: messages.read, icon: <FileText className="size-3.5" />, ...readViews }),
    toolRenderer(TodoGrep, { label: messages.search, icon: <Search className="size-3.5" />, ...grepViews }),
    toolRenderer(TodoWrite, { label: messages.write, icon: <Pencil className="size-3.5" />, ...textWriteViews }),
    toolRenderer(TodoEdit, { label: messages.edit, icon: <Pencil className="size-3.5" />, ...textEditViews }),
    toolRenderer(TodoCreate, { label: messages.newTask, icon: <Plus className="size-3.5" />, ...createViews }),
    toolRenderer(TodoClaim, { label: messages.claim, icon: <UserRoundCheck className="size-3.5" />, ...claimViews }),
    toolRenderer(TodoRelease, { label: messages.release, icon: <Undo2 className="size-3.5" />, ...releaseViews }),
    toolRenderer(TodoComplete, { label: messages.complete, icon: <Check className="size-3.5" />, ...completeViews }),
    toolRenderer(TodoReopen, { label: messages.reopen, icon: <RotateCcw className="size-3.5" />, ...reopenViews }),
    toolRenderer(TodoDelete, { label: messages.deleteTask, icon: <Trash2 className="size-3.5" />, ...deleteViews }),
  ],
} satisfies RendererModule;
