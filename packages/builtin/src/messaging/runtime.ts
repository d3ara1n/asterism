import { z } from "zod";
import { nanoid } from "nanoid";
import { defineModule, implementResource, implementCreation, implementTool, implementAction, implementCall,
  MessagingError, type Lifetime, type ObjectExecutor, type ObjectReader, type ToolContribution, type MessagingHandle } from "@asterism-app/sdk/runtime";
import { modelInputLimits, type ConnectionEvent, type ConversationAddress, type Json, type MessagingConnectionInfo, type MessagingMessage, type ResourceRef } from "@asterism-app/sdk/contracts";
import { Agent, SubmitAgentInput, type AgentInputPart } from "@asterism-app/builtin-api/contracts";
import { defineAgentCreation } from "@asterism-app/builtin-api/runtime";
import { Conversations, Chat, CreateConversations, CreateChat, chatCreateSchema, ConversationsView, ChatView,
  ConversationsList, ConversationsSubscribe, ConfigureSubscription, SubscriptionChanged, ChatRead, ChatSend,
  BrowseConversations, listResultSchema, ReadChat, SendChat, ChatMessageSent,
  ChatSee, type SubscriptionTarget, type ViewConnection } from "./contract.ts";
import { captureImage, chatFileRef, chatMessage, chatMessageParts, chatMessagesToModel, messageInputParts, openChatFile } from "./content.ts";
import { inputPartsToModel } from "../shared/file-parts.ts";
import { coversAddress, foldSubscriptions, matchesSubscription } from "./subscriptions.ts";
import { telegramProvider } from "./telegram.ts";
import { discordProvider } from "./discord.ts";
import { slackProvider } from "./slack.ts";
import { qqProvider } from "./qq.ts";
import { messagingOutcome, messagingUiCall } from "./outcome.ts";
import { conversationsCard, chatCard } from "../shared/card-appearance.ts";

type ListTarget = { connectionId: string; since?: string } | null;
const objectKey = (ref: ResourceRef) => JSON.stringify([ref.sessionId, ref.id]);
const addressLines = (connectionId: string, address: ConversationAddress) => [
  `connectionId: ${connectionId}`, `conversationId: ${address.conversationId}`,
  ...(address.threadId ? [`threadId: ${address.threadId}`] : []),
];
const messageLines = (message: MessagingMessage) => [
  `messageId: ${message.id}`, `sender: ${message.sender.name} (${message.sender.id}, ${message.sender.role})`, `sentAt: ${message.sentAt}`,
  ...(message.replyTo ? [`replyTo: ${message.replyTo}`] : []),
  ...(message.groupId ? [`groupId: ${message.groupId}`] : []),
];
/** Event metadata with addresses usable by tools; a Chat follows it with the message parts. */
function eventText({ connectionId, event }: ConnectionEvent, includeMessages = true): string {
  const location = [...addressLines(connectionId, event.conversation), `title: ${event.conversation.title}`, `kind: ${event.conversation.kind}`];
  if (event.kind === "conversation.discovered") return ["Conversation discovered", ...location].join("\n");
  return ["New messages", ...location, ...(includeMessages ? event.messages.flatMap(messageLines) : [])].join("\n");
}

export default defineModule(plugin => {
  const objects = new Map<string, ResourceRef>();
  /** Subscription projection per Conversations object; rebuilt after commits, cursor movement, and detachment. */
  const subscriptionCache = new Map<string, SubscriptionTarget[]>();
  /** Latest observed event markers while the application runs; views reload their queries when a marker changes. */
  const chatLatest = new Map<string, string>(), connectionLatest = new Map<string, string>();
  const executor = (ref: ResourceRef) => plugin.object<Json>(ref.sessionId, ref.kind === Chat.kind ? Chat : Conversations, ref.id);
  const subscriptions = (object: ObjectReader) => {
    const key = objectKey(object.ref);
    let cached = subscriptionCache.get(key);
    if (!cached) {
      cached = foldSubscriptions(object.session.snapshot().records.all({ scope: "timeline", source: object.ref.id, contracts: [SubscriptionChanged.id] }));
      subscriptionCache.set(key, cached);
    }
    return cached;
  };
  const invalidateAll = (): undefined => {
    subscriptionCache.clear();
    for (const ref of objects.values()) executor(ref).invalidate();
  };
  const chatBinding = (ref: ResourceRef) => {
    const found = executor(ref).session.snapshot().resources.get(Chat, ref.id);
    return found?.status === "known" ? found.resource.data : null;
  };
  /** Mark Chats bound to an address and every Conversations view as changed. */
  const touch = (connectionId: string, address: ConversationAddress, marker: string) => {
    connectionLatest.set(connectionId, marker);
    for (const ref of objects.values()) {
      if (ref.kind === Chat.kind) {
        const binding = chatBinding(ref);
        if (!binding || !coversAddress(binding, connectionId, address)) continue;
        chatLatest.set(objectKey(ref), marker);
      }
      executor(ref).invalidate();
    }
  };
  const viewConnection = (connection: MessagingConnectionInfo): ViewConnection => {
    const type = plugin.messaging.types().find(type => type.id === connection.providerId);
    const latest = connectionLatest.get(connection.id);
    return { ...connection, providerLabel: type?.label ?? null, ...(latest ? { latest } : {}) };
  };
  const chatView = (data: z.infer<typeof Chat.stateSchema>, ref: ResourceRef) => {
    const connection = plugin.messaging.connections().find(connection => connection.id === data.connectionId);
    const latest = chatLatest.get(objectKey(ref));
    return { ...data, connection: connection ? viewConnection(connection) : null, ...(latest ? { latest } : {}) };
  };

  plugin.lifetime.defer(plugin.messaging.subscribeConnections(invalidateAll));
  plugin.lifetime.defer(plugin.messaging.subscribe(event => {
    const { connectionId } = event;
    touch(connectionId, event.event.conversation, JSON.stringify([event.event.conversation.conversationId,
      event.event.conversation.threadId ?? null, event.event.kind === "messages.received" ? event.event.messages.map(message => message.id) : event.event.kind]));
    // The connection's own messages are observations, not input; delivering them would echo an Agent's sends back to it.
    if (event.event.kind === "messages.received") {
      const messages = event.event.messages.filter(message => message.sender.role !== "self");
      if (!messages.length) return;
      event = { ...event, event: { ...event.event, messages } };
    }
    for (const ref of objects.values()) {
      const object = executor(ref);
      const receives = ref.kind === Conversations.kind
        ? subscriptions(object).some(target => matchesSubscription(target, event))
        : event.event.kind === "messages.received" && !!chatBinding(ref) && matchesSubscription(chatBinding(ref)!, event);
      if (!receives) continue;
      const title = object.snapshot()?.title ?? ref.id;
      const source = { ...ref };
      for (const recipient of object.session.snapshot().resources.linkedTo(ref)) {
        if (recipient.ref.kind !== Agent.kind) continue;
        plugin.tasks.start(`messaging/${nanoid()}`, signal => plugin.content.withScope(async content => {
          const binding = source.kind === Chat.kind ? chatBinding(source) : null;
          const parts: AgentInputPart[] = [{ kind: "text", text: eventText(event, !binding) }];
          // Captured images are staged for this input only; its record retains them.
          if (binding && event.event.kind === "messages.received") parts.push(...await messageInputParts(event.event.messages.flatMap(message => [
            { kind: "text" as const, text: messageLines(message).join("\n") }, ...chatMessageParts(chatMessage(source, message)),
          ]),
            async function* (part) { yield* openChatFile(await plugin.messaging.resolve(binding.connectionId, { signal }), binding, part.ref.locator, signal); },
            content, signal));
          await plugin.session(source.sessionId).invoke(SubmitAgentInput, recipient.ref, {
            submissionId: nanoid(16), mode: "follow", parts,
            sender: { kind: "event", resource: source, name: title },
          }, { signal, content });
        }), { object: source, affectsHistory: false });
      }
    }
  }));

  const attach = (_data: Json, object: ObjectReader, lifetime: Lifetime) => {
    const key = objectKey(object.ref);
    objects.set(key, object.ref);
    lifetime.defer(() => { objects.delete(key); subscriptionCache.delete(key); chatLatest.delete(key); });
  };
  const configure = (object: ObjectExecutor, target: SubscriptionTarget, enabled: boolean, title?: string) => {
    const name = title ?? (target.conversationId ? undefined : plugin.messaging.connections().find(item => item.id === target.connectionId)?.name);
    object.commit(writer => { writer.append(SubscriptionChanged, { target, enabled, ...(name ? { title: name } : {}) }); });
    subscriptionCache.delete(objectKey(object.ref));
    object.invalidate();
  };
  const sent = (connectionId: string, address: ConversationAddress, message: MessagingMessage) =>
    touch(connectionId, address, JSON.stringify([address.conversationId, address.threadId ?? null, message.id]));

  /** Connection handles captured at one boundary: a model request, or one view call. */
  type Captured = { connections: MessagingConnectionInfo[]; get(id: string): Promise<MessagingHandle> };
  const capture = (): Captured => {
    const connections = [...plugin.messaging.connections()];
    const handles = new Map(connections.filter(connection => connection.enabled).map(connection => [connection.id,
      plugin.messaging.resolve(connection.id, { signal: plugin.lifetime.signal }).then(value => ({ value }), error => ({ error }))]));
    return { connections, async get(id) {
      const result = await handles.get(id);
      if (!result) throw new MessagingError("unavailable", `Messaging connection '${id}' is unavailable.`);
      if ("error" in result) throw result.error;
      return result.value;
    } };
  };
  const list = async (access: Captured, target: ListTarget, signal: AbortSignal) => listResultSchema.parse(target === null
    ? { kind: "connections", connections: access.connections, truncated: false }
    : { kind: "conversations", connectionId: target.connectionId,
      ...await (await access.get(target.connectionId)).listConversations({ ...(target.since ? { since: target.since } : {}) }, { signal }) });
  const capturedTool = (create: (captured: () => Captured) => ToolContribution): ToolContribution => ({
    ...create(capture), capture: () => { const captured = capture(); return create(() => captured); },
  });
  const binding = (object: ObjectReader) => Chat.stateSchema.parse(object.snapshot()!.data);

  return {
    messagingProviders: [telegramProvider(plugin), discordProvider(plugin), slackProvider(plugin), qqProvider(plugin)],
    observers: [{ id: "messaging.subscriptions", cursorChanged: invalidateAll }],
    calls: [
      implementCall(BrowseConversations, (input, { signal }) => messagingUiCall(signal, () => list(capture(), input, signal))),
      implementCall(ReadChat, (input, { object, signal }) => messagingUiCall(signal, async () => {
        const { connectionId, ...address } = binding(object);
        const result = await (await capture().get(connectionId)).readMessages({ ...address, ...input }, { signal });
        return { ...result, messages: result.messages.map(message => chatMessage(object.ref, message)) };
      })),
    ],
    resources: [
      implementResource(Conversations, ConversationsView, {
        card: conversationsCard, links: { receive: true }, records: [SubscriptionChanged], attach,
        creation: implementCreation(CreateConversations, { create: () => ({ title: "Conversations", data: {} }) }),
        project: (_data, object) => ({ connections: plugin.messaging.connections().map(viewConnection), subscriptions: subscriptions(object) }),
        inspect: async (_data, object) => ({ subscriptions: subscriptions(object) }),
        actions: [
          implementAction(ConfigureSubscription, { async execute({ target, enabled, title }, object) { configure(object, target, enabled, title); } }),
        ],
      }),
      implementResource(Chat, ChatView, {
        card: chatCard, links: { receive: true }, records: [ChatMessageSent], attach,
        async *openFile(data, locator, { signal }) {
          yield* openChatFile(await plugin.messaging.resolve(data.connectionId, { signal }), data, locator, signal);
        },
        creation: implementCreation(CreateChat, { create: ({ title, ...data }) => ({ title, data }) }),
        project: (data, object) => chatView(data, object.ref),
        inspect: async (data, object) => chatView(data, object.ref),
        actions: [implementAction(SendChat, { execute: ({ text, replyTo }, object, signal) => messagingUiCall(signal, async () => {
          const { connectionId, ...address } = binding(object);
          const message = chatMessage(object.ref, await (await capture().get(connectionId)).sendMessage(
            { ...address, parts: [{ kind: "text", text }], ...(replyTo ? { replyTo } : {}) }, { signal }));
          object.commit(writer => { writer.append(ChatMessageSent, message); });
          sent(connectionId, address, message);
        }) })],
      }),
    ],
    tools: [
      capturedTool(captured => implementTool(ConversationsList, {
        call(_data, target, _args, { signal }) { return messagingOutcome("read", signal, () => list(captured(), target, signal)); },
      })),
      implementTool(ConversationsSubscribe, {
        async call(_data, target, { enabled }, { object }) {
          configure(object, target, enabled);
          return { kind: "succeeded", data: { target, enabled } };
        },
      }),
      capturedTool(captured => implementTool(ChatRead, {
        call(data, target, _args, { signal, object }) {
          const { connectionId, ...address } = data;
          return messagingOutcome("read", signal, async () => {
            const result = await (await captured().get(connectionId)).readMessages({ ...address, ...target }, { signal });
            return { ...result, messages: result.messages.map(message => chatMessage(object.ref, message)) };
          });
        },
        toModel: data => [{ kind: "text", text: JSON.stringify({ cursor: data.cursor, truncated: data.truncated, missingIds: data.missingIds }) }, ...chatMessagesToModel(data.messages)],
      })),
      capturedTool(captured => implementTool(ChatSee, {
        call(data, target, _args, { object, signal }) {
          return messagingOutcome("read", signal, async () => {
            const source = openChatFile(await captured().get(data.connectionId), data, target, signal);
            const image = await captureImage(object.content, source, modelInputLimits.file, signal);
            return { ...target, ...image, ref: chatFileRef(object.ref, target.messageId, target.fileId) };
          });
        },
        toModel: image => inputPartsToModel([{ kind: "file", file: image.file, ref: image.ref, mediaType: image.mediaType, size: image.size }]),
      })),
      capturedTool(captured => implementTool(ChatSend, {
        call(data, target, { parts }, { signal, object }) {
          const { connectionId, ...address } = data;
          return messagingOutcome("write", signal, async () => {
            const message = chatMessage(object.ref, await (await captured().get(connectionId)).sendMessage({ ...address, ...target, parts }, { signal }));
            sent(connectionId, address, message);
            return message;
          });
        },
        toModel: data => chatMessagesToModel([data]),
      })),
    ],
  };
});

export const messagingCreations = [
  defineAgentCreation({ id: CreateConversations.id, creation: CreateConversations,
    description: "Create a Conversations resource for browsing configured messaging connections and their conversations and managing notification subscriptions.",
    inputSchema: z.strictObject({ expose_self: z.boolean().optional().describe("Expose yourself to this resource to receive subscribed notifications. Defaults to false.") }),
    toInput: () => ({}), toOptions: ({ expose_self }) => ({ exposeSelf: expose_self }),
    guidelines: [
      "expose_self defaults to false. Setting it to true exposes you to the new resource so it can deliver subscribed notifications to you.",
      "The resource starts with no subscriptions. The subscribe tool configures notification targets after creation.",
      "A connection subscription reports newly discovered conversations; a conversation subscription reports incoming message metadata, optionally scoped to a thread.",
    ] }),
  defineAgentCreation({ id: CreateChat.id, creation: CreateChat,
    description: "Create a Chat resource bound to an external conversation, optionally scoped to a thread.",
    inputSchema: chatCreateSchema.extend({ expose_self: z.boolean().optional().describe("Expose yourself to this Chat to receive incoming messages. Defaults to false.") }),
    toInput: ({ expose_self: _expose, ...input }) => input,
    toOptions: ({ expose_self }) => ({ exposeSelf: expose_self }),
    guidelines: [
      "connectionId and conversationId identify the external conversation; threadId optionally narrows it to a thread. These IDs can come from list results, external events, or explicit user input.",
      "expose_self defaults to false. Setting it to true exposes you to the new Chat so it can deliver incoming messages and their content to you. The Chat's binding determines which messages it delivers.",
    ] }),
];
