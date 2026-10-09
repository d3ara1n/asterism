import { useState } from "react";
import { Check, GitBranch } from "lucide-react";
import type { SessionNode } from "../../../shared/session";
import { isBlockNode, sessionPath, snap } from "../../../shared/session-path";
import { Button } from "../../shared/ui/button";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { t } from "../../shared/i18n";
import { s } from "../configuration/state";
import type { SessionController } from "./controller";
import { useSession, useSessionProgress } from "./state";

/** 历史面板只表达查看与分叉意图，不读取或同步工作台。 */
export function SessionHistoryPanel({ controller }: { controller: SessionController }) {
  const { snapshot, state, historical } = useSession(controller);
  const progress = useSessionProgress(controller);
  const [kinds, setKinds] = useState<Set<SessionNode["kind"]>>(new Set(["message", "text", "toolcall", "event", "notice"]));
  if (!snapshot) return <IslandPanel title={s("Session history", "会话历史")}><p className="type-caption">{t.openingBody}</p></IslandPanel>;
  const onPath = new Set(sessionPath(snapshot.nodes, snapshot.cursor).map(node => node.id));
  const inspected = state.position.kind === "history" ? state.position.nodeId : undefined;
  const continuation = inspected === undefined ? snapshot.cursor : inspected === null ? null : snap(snapshot.nodes, inspected);
  const continuationNode = snapshot.nodes.find(node => node.id === continuation);
  const visible = snapshot.nodes.filter(node => (!isBlockNode(node) || node.complete) && kinds.has(node.kind));
  const running = progress.runningAgentIds.length > 0;
  const toggle = (kind: SessionNode["kind"]) => setKinds(previous => {
    const next = new Set(previous); if (next.has(kind)) next.delete(kind); else next.add(kind); return next;
  });
  return <IslandPanel title={s("Session history", "会话历史")} description={snapshot.title}>
    <div className="mb-2 flex flex-wrap gap-1">
      {(["message", "thinking", "text", "toolcall", "event", "notice"] as const).map(kind =>
        <Button key={kind} size="sm" variant={kinds.has(kind) ? "secondary" : "ghost"} onClick={() => toggle(kind)}>{kindLabel(kind)}</Button>)}
    </div>
    <div className="mb-3 flex gap-1">
      <Button className="flex-1" variant={historical ? "ghost" : "secondary"} onClick={controller.followCursor}>{!historical && <Check />}{t.live}</Button>
      <Button className="flex-1" variant="default" disabled={!historical || running || state.busy || state.status !== "ready"}
        onClick={() => { if (inspected !== undefined) void controller.branchFrom(inspected); }}>
        <GitBranch />{s("Continue from here", "从此处继续")}</Button>
    </div>
    {(state.status === "loading") && <p role="status" className="type-caption mb-2">{t.openingBody}</p>}
    {state.error && <p role="alert" className="type-caption mb-2">{state.error}</p>}
    {running && <p className="type-caption mb-2">{s("Stop or wait for running agents before branching.", "分叉前需等待或停止正在运行的代理。")}</p>}
    {historical && continuation !== inspected && <p className="type-caption mb-2">
      {s("Continuation starts at: ", "实际继续位置：")}{continuationNode ? `${kindLabel(continuationNode.kind)} · ${nodeLabel(continuationNode)}` : s("Session start", "会话起点")}
    </p>}
    <div className="flex flex-col gap-0.5">
      {visible.map(node => <Button key={node.id} variant={inspected === node.id ? "secondary" : "ghost"}
        className={`h-auto justify-start py-1.5 font-normal ${onPath.has(node.id) ? "" : "opacity-60"}`} onClick={() => controller.inspect(node.id)}>
        <span className="type-caption w-14 shrink-0 text-left">{kindLabel(node.kind)}</span><span className="min-w-0 truncate">{nodeLabel(node)}</span>
      </Button>)}
    </div>
  </IslandPanel>;
}
function kindLabel(kind: SessionNode["kind"]): string {
  return ({ message: s("Input", "输入"), thinking: s("Thinking", "思考"), text: s("Reply", "回复"), toolcall: s("Tool", "工具"),
    event: s("Event", "事件"), notice: s("Notice", "通知") } as const)[kind];
}
function nodeLabel(node: SessionNode): string {
  switch (node.kind) {
    case "message": case "text": case "thinking": return node.text.slice(0, 64) || "…";
    case "toolcall": return node.name;
    case "event": return node.type;
    case "notice": return node.message;
  }
}
