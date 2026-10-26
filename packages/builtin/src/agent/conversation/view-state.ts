import type { RendererViewStateEntry } from "@asterism/sdk/renderer";
import { ConversationHistoryWindow } from "./history-window";

/** 对话时间线的条目视图状态：按 `timelineKey` 分条目保存，由代理对象保留，条目随滚动重新挂载时恢复。 */
export class TimelineViewState {
  private entries = new Map<string, RendererViewStateEntry>();
  openProcesses: ReadonlySet<string> = new Set();
  readonly historyWindow = new ConversationHistoryWindow();
  entry(key: string): RendererViewStateEntry {
    let entry = this.entries.get(key);
    if (!entry) this.entries.set(key, entry = new Map());
    return entry;
  }
}

/** 视图状态 key：内置贡献以插件 ID 为前缀。 */
export const viewStateKeys = {
  disclosure: "asterism.builtin/disclosure",
  toolDetails: "asterism.builtin/tool-details",
} as const;
