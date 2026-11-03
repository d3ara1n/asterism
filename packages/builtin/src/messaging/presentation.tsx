import { Megaphone, User, Users, type LucideIcon } from "lucide-react";
import type { I18n } from "@asterism-app/sdk/renderer";
import type { MessagingConnectionStatus } from "@asterism-app/sdk/contracts";
import type { StatusTone } from "@asterism-app/ui/ui/status";
import type { InputFile } from "../shared/attachments";
import { messagingMessages as messages } from "../messages/messaging";
import type { ChatMessage } from "./contract";
import { relativeUnit } from "./timeline";

/** Presentation shared by the messaging cards and tool views. */
export const statusTone: Record<MessagingConnectionStatus, StatusTone> = {
  connected: "success", connecting: "progress", reconnecting: "warning", failed: "error", disabled: "neutral", unavailable: "neutral",
};
export const statusLabel = {
  connected: messages.connected, connecting: messages.connecting, reconnecting: messages.reconnecting,
  failed: messages.disconnected, disabled: messages.disabled, unavailable: messages.unavailable,
} satisfies Record<MessagingConnectionStatus, unknown>;
/** Provider conversation kinds with a dedicated icon; other kinds use the generic conversation icon. */
export const kindIcon: Record<string, LucideIcon> = { private: User, group: Users, supergroup: Users, channel: Megaphone };

export function relativeTime(i18n: I18n, iso: string) {
  const { value, unit } = relativeUnit(Date.parse(iso), Date.now());
  return new Intl.RelativeTimeFormat(i18n.locale, { numeric: "auto", style: "short" }).format(value, unit);
}
export function chatFiles(message: ChatMessage): InputFile[] {
  return message.parts.flatMap(part => part.kind === "file" ? [{ kind: "file-reference" as const, ref: part.ref, mediaType: part.mediaType,
    ...(part.filename ? { filename: part.filename } : {}), ...(part.size === undefined ? {} : { size: part.size }) }] : []);
}
export function chatTexts(message: ChatMessage): string[] {
  return message.parts.flatMap(part => part.kind === "text" && part.text ? [part.text] : []);
}
