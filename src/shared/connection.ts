import type { ChannelEnd, ChannelValue } from "@asterism/sdk/contracts";
import { coreChannel } from "./core.ts";
import type { Command, CommandResult } from "./contracts.ts";
import type { SessionBridge, SessionChanged, SessionCommand, SessionResult } from "./session.ts";
import type { ConfigurationBridge, ConfigurationCommand, ConfigurationResult } from "./configuration.ts";
import type { PluginConfigurationBridge, PluginConfigurationCommand, PluginConfigurationResult } from "./plugin-configuration.ts";
import type { ContentBridge, ContentCommand, ContentResult } from "./content.ts";
import type { EventControl, EventFrame } from "./plugin-events.ts";
export type { ChannelEnd, ChannelValue };
import type { CallControl, CallFrame } from "./plugin-calls.ts";

/**
 * Direct renderer/task-process connections: the main process checks sources only when handing off MessagePorts and never forwards subsequent business messages.
 * Both endpoints come from one build with typed frame shapes; task-process domain command entries validate structure once each.
 */
export const connectionRequestChannel = coreChannel("runtime-connection");
/** Window message marker used by preload to hand ports to pages. */
export const connectionPortMessage = "asterism:runtime-port";

export interface ConnectionServices {
  workspace: { command: Command; result: CommandResult };
  session: { command: SessionCommand; result: SessionResult };
  configuration: { command: ConfigurationCommand; result: ConfigurationResult };
  "plugin-configuration": { command: PluginConfigurationCommand; result: PluginConfigurationResult };
  content: { command: ContentCommand; result: ContentResult };
}
export type ConnectionService = keyof ConnectionServices;
export const connectionServices: readonly ConnectionService[] = ["workspace", "session", "configuration", "plugin-configuration", "content"];

export type ChannelControl =
  | { type: "open"; id: number; contract: string; object: { sessionId: string; id: string; kind: string } }
  | { type: "message"; id: number; data: ChannelValue }
  | { type: "close"; id: number };
export type ChannelFrame =
  | { type: "message"; id: number; data: ChannelValue }
  | { type: "closed"; id: number; end: ChannelEnd };

/** renderer → runtime。 */
export type RendererFrame =
  | { kind: "request"; id: number; service: ConnectionService; command: unknown }
  | { kind: "events"; control: EventControl }
  | { kind: "calls"; control: CallControl }
  | { kind: "channels"; control: ChannelControl };
/** runtime → renderer。 */
export type RuntimeFrame =
  | { kind: "response"; id: number; result: ConnectionServices[ConnectionService]["result"] }
  | { kind: "session"; event: SessionChanged }
  | { kind: "configuration.changed" }
  | { kind: "plugin-configuration.changed"; id: string }
  | { kind: "events"; frame: EventFrame }
  | { kind: "calls"; frame: CallFrame }
  | { kind: "channels"; frame: ChannelFrame };

/** Minimal shared port shape, adapted by Electron MessagePortMain, DOM MessagePort, and Node MessagePort. */
export interface ConnectionPort<In, Out> {
  post(message: Out): void;
  onMessage(listener: (message: In) => void): void;
  close(): void;
}

export interface EventBridge { send(control: EventControl): void; onFrame(listener: (frame: EventFrame) => void): () => void }
export interface CallBridge { send(control: CallControl): void; onFrame(listener: (frame: CallFrame) => void): () => void }
export interface ChannelBridge { send(control: ChannelControl): void; onFrame(listener: (frame: ChannelFrame) => void): () => void }

/** Renderer-accessible task-process capabilities, separate from main-process window, appearance, language, and other capabilities. */
export interface RuntimeBridge {
  execute(command: Command): Promise<CommandResult>;
  session: SessionBridge;
  configuration: ConfigurationBridge;
  pluginConfiguration: PluginConfigurationBridge;
  content: ContentBridge;
  events: EventBridge;
  calls: CallBridge;
  channels: ChannelBridge;
}
