import type { UiText } from "./i18n.ts";
import type { ProviderSetting, ProviderSettingValues } from "./provider-settings.ts";
import type { MessagingProviderType, MessagingConnectionInfo, ConversationQuery, ConversationList,
  MessageQuery, MessageList, SendMessage, MessagingMessage, MessagingEvent, ConnectionEvent, MessagingFileQuery } from "./messaging.ts";

export interface MessagingInstance {
  readonly identity: string;
  /**
   * Runs until the receiving signal ends. Call ready once the platform has accepted this receiver; the connection then
   * reports connected and its retry backoff resets. A rejection is a connection failure: the host calls receive again on
   * the same instance after a backoff unless the error is a terminal MessagingError. Queries and sends have independent request signals.
   */
  receive(options: { signal: AbortSignal; ready(): void }): Promise<void>;
  listConversations(query: ConversationQuery, options: { signal: AbortSignal }): Promise<ConversationList>;
  readMessages(query: MessageQuery, options: { signal: AbortSignal }): Promise<MessageList>;
  sendMessage(input: SendMessage, options: { signal: AbortSignal }): Promise<MessagingMessage>;
  openFile?(query: MessagingFileQuery, options: { signal: AbortSignal }): AsyncIterable<Uint8Array>;
}
export interface MessagingProviderDefinition {
  id: string;
  label: UiText;
  /** Settings the user configures for each connection, rendered in declaration order. */
  settings: readonly ProviderSetting[];
  /**
   * One instance per enabled connection; a creation failure is retried like a receive failure.
   * Provider-owned persistence may be shared across its instances.
   */
  create(context: {
    connectionId: string; settings: ProviderSettingValues;
    signal: AbortSignal; publish(event: MessagingEvent): void;
  }): Promise<MessagingInstance>;
  /** Release provider-owned data for a removed connection after its receiver has ended. */
  forget?(connectionId: string): void | Promise<void>;
}
export interface MessagingHandle {
  listConversations(query: ConversationQuery, options: { signal: AbortSignal }): Promise<ConversationList>;
  readMessages(query: MessageQuery, options: { signal: AbortSignal }): Promise<MessageList>;
  sendMessage(input: SendMessage, options: { signal: AbortSignal }): Promise<MessagingMessage>;
  openFile(query: MessagingFileQuery, options: { signal: AbortSignal }): AsyncIterable<Uint8Array>;
}
export interface MessagingServices {
  types(): readonly MessagingProviderType[];
  connections(): readonly MessagingConnectionInfo[];
  /** Captures a connection handle. Operations await a connection in progress with their own cancellation signals. */
  resolve(connectionId: string, options: { signal: AbortSignal }): Promise<MessagingHandle>;
  subscribe(listener: (event: ConnectionEvent) => void): () => void;
  subscribeConnections(listener: () => void): () => void;
}
/**
 * request_failed and errors other than MessagingError are transient and retried with backoff; retryAfterMs overrides the delay.
 * Other codes are terminal for a receiving connection.
 */
export type MessagingErrorCode = "unavailable" | "unsupported" | "invalid_input" | "invalid_cursor" | "request_failed";
export class MessagingError extends Error {
  readonly retryAfterMs?: number;
  constructor(readonly code: MessagingErrorCode, message: string, options: { retryAfterMs?: number; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}
