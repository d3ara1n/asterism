import { useEffect, useRef, useState } from "react";
import { useRendererCalls, useRendererObject } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { ReadTodoPage } from "./contract";
import type { Todo, TodoPage, TodoSummary } from "./model";
import { todoFailure } from "./ui";

export type TodoFilterKey = "open" | "done" | "all";
const statuses: Record<TodoFilterKey, Todo["status"][] | undefined> = { open: ["pending", "in_progress"], done: ["done"], all: undefined };
const pageSize = 100, maxRefresh = 500;
export type TodoPages = { filter: TodoFilterKey; todos: TodoSummary[]; total: number; nextOffset: number | null };

function query(filter: TodoFilterKey, offset: number, limit: number): TodoPage {
  const status = statuses[filter];
  return { offset, limit, ...(status ? { status } : {}) };
}

/**
 * Loaded task summaries for one filter. A list change refreshes as many rows as were already loaded
 * while the previous rows stay visible; a filter change starts empty. loadMore appends the next page.
 */
export function useTodoPages(filter: TodoFilterKey, latest: number) {
  const calls = useRendererCalls(), object = useRendererObject();
  const [pages, setPages] = useState<TodoPages | null>(null);
  const [error, setError] = useState<UiText | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const more = useRef(false);
  const depth = useRef<{ filter: TodoFilterKey; count: number }>({ filter, count: 0 });
  const scope = useRef<AbortController | null>(null);
  useEffect(() => { if (pages) depth.current = { filter: pages.filter, count: pages.todos.length }; }, [pages]);
  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller; more.current = false;
    setLoadingMore(false); setError(null);
    const loaded = depth.current.filter === filter ? depth.current.count : 0;
    void calls.invoke(ReadTodoPage, query(filter, 0, Math.min(maxRefresh, Math.max(pageSize, loaded))), { object: object.ref, signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setPages({ filter, ...value }); },
        failure => { if (!controller.signal.aborted) setError(todoFailure(failure)); });
    return () => controller.abort();
  }, [calls, object.ref, filter, latest]);
  const loadMore = () => {
    const controller = scope.current;
    if (!controller || controller.signal.aborted || more.current || pages?.filter !== filter || pages.nextOffset === null) return;
    more.current = true; setLoadingMore(true);
    void calls.invoke(ReadTodoPage, query(filter, pages.nextOffset, pageSize), { object: object.ref, signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      // Concurrent changes can shift offsets, so a row may arrive twice.
      setPages(current => {
        if (!current || current.filter !== filter) return current;
        const seen = new Set(current.todos.map(todo => todo.id));
        return { ...current, todos: [...current.todos, ...value.todos.filter(todo => !seen.has(todo.id))], total: value.total, nextOffset: value.nextOffset };
      });
    }, failure => { if (!controller.signal.aborted) setError(todoFailure(failure)); }).finally(() => {
      if (!controller.signal.aborted) { more.current = false; setLoadingMore(false); }
    });
  };
  return { pages: pages?.filter === filter ? pages : null, error, loadingMore, loadMore };
}
