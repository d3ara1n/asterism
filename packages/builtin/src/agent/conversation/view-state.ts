import type { RendererViewStateEntry } from "@asterism/sdk/renderer";
import { ConversationHistoryWindow } from "./history-window";

/** Conversation timeline item view state: saved per item by `timelineKey`, retained by the agent object, and restored when items remount during scrolling. */
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

/** View-state key: built-in contributions use the plugin ID as a prefix. */
export const viewStateKeys = {
  disclosure: "asterism.builtin/disclosure",
  toolDetails: "asterism.builtin/tool-details",
} as const;
