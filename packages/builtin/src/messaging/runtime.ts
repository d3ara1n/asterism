import { z } from "zod";
import { nanoid } from "nanoid";
import { defineModule, implementResource, implementCreation, implementTool, implementAction, implementCall,
  MessagingError, type Lifetime, type ObjectExecutor, type ObjectReader, type ToolContribution, type MessagingHandle } from "@asterism-app/sdk/runtime";
import type { ConnectionEvent, ConversationAddress, Json, MessagingConnectionInfo, MessagingMessage, ResourceRef } from "@asterism-app/sdk/contracts";
import { Agent, SubmitAgentInput } from "@asterism-app/builtin-api/contracts";
import { defineAgentCreation } from "@asterism-app/builtin-api/runtime";
import { Conversations, Chat, CreateConversations, CreateChat, chatCreateSchema, ConversationsView, ChatView,
  ConversationsList, ConversationsSubscribe, ConfigureSubscription, SubscriptionChanged, ChatRead, ChatSend,
  BrowseConversations, listResultSchema, ReadChat, SendChat, ChatMessageSent, OpenChat,
  type SubscriptionTarget, type ViewConnection } from "./contract.ts";
import { coversAddress, foldSubscriptions, matchesSubscription, selectDeliveries, type DeliveryCandidate } from "./subscriptions.ts";
import { telegramProvider } from "./telegram.ts";
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
];
/** Event facts for the Agent input contract: addresses usable by tools, and the message itself only for Chats. */
export function eventText({ connectionId, event }: ConnectionEvent, full: boolean): string {
  const location = [...addressLines(connectionId, event.conversation), `title: ${event.conversation.title}`, `kind: ${event.conversation.kind}`];
  if (event.kind === "conversation.discovered") return ["Conversation discovered", ...location].join("\n");
  return [full ? "Message received" : "New message", ...location, ...messageLines(event.message),
    ...(full ? ["", event.message.text] : [])].join("\n");
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
      event.event.conversation.threadId ?? null, event.event.kind === "message.received" ? event.event.message.id : event.event.kind]));
    // The connection's own messages are observations, not input; delivering them would echo an Agent's sends back to it.
    if (event.event.kind === "message.received" && event.event.message.sender.role === "self") return;
    const bySession = new Map<string, DeliveryCandidate[]>();
    for (const ref of objects.values()) {
      const object = executor(ref);
      const receives = ref.kind === Conversations.kind
        ? subscriptions(object).some(target => matchesSubscription(target, event))
        : event.event.kind === "message.received" && !!chatBinding(ref) && matchesSubscription(chatBinding(ref)!, event);
      if (!receives) continue;
      const title = object.snapshot()?.title ?? ref.id;
      const candidates = bySession.get(ref.sessionId) ?? [];
      for (const recipient of object.session.snapshot().resources.linkedTo(ref))
        if (recipient.ref.kind === Agent.kind) candidates.push({ source: ref, title, recipient: recipient.ref });
      bySession.set(ref.sessionId, candidates);
    }
    for (const candidates of bySession.values()) for (const delivery of selectDeliveries(candidates)) {
      const source = { ...delivery.source };
      plugin.tasks.start(`messaging/${nanoid()}`, async signal => {
        await plugin.session(source.sessionId).invoke(SubmitAgentInput, delivery.recipient, {
          submissionId: nanoid(16), mode: "follow",
          parts: [{ kind: "text", text: eventText(event, source.kind === Chat.kind) }],
          sender: { kind: "event", resource: source, name: delivery.title },
        }, { signal });
      }, { object: source, affectsHistory: false });
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
    messagingProviders: [telegramProvider(plugin)],
    observers: [{ id: "messaging.subscriptions", cursorChanged: invalidateAll }],
    calls: [
      implementCall(BrowseConversations, (input, { signal }) => list(capture(), input, signal)),
      implementCall(ReadChat, async (input, { object, signal }) => {
        const { connectionId, ...address } = binding(object);
        return (await capture().get(connectionId)).readMessages({ ...address, ...input }, { signal });
      }),
    ],
    resources: [
      implementResource(Conversations, ConversationsView, {
        card: conversationsCard, links: { receive: true }, records: [SubscriptionChanged], attach,
        creation: implementCreation(CreateConversations, { create: () => ({ title: "Conversations", data: {} }) }),
        project: (_data, object) => ({ connections: plugin.messaging.connections().map(viewConnection), subscriptions: subscriptions(object) }),
        inspect: async (_data, object) => ({ subscriptions: subscriptions(object) }),
        actions: [
          implementAction(ConfigureSubscription, { async execute({ target, enabled, title }, object) { configure(object, target, enabled, title); } }),
          implementAction(OpenChat, { async execute(input, object, signal) { await object.session.create(CreateChat, input, { signal }); } }),
        ],
      }),
      implementResource(Chat, ChatView, {
        card: chatCard, links: { receive: true }, records: [ChatMessageSent], attach,
        creation: implementCreation(CreateChat, { create: ({ title, ...data }) => ({ title, data }) }),
        project: (data, object) => chatView(data, object.ref),
        inspect: async (data, object) => chatView(data, object.ref),
        actions: [implementAction(SendChat, { async execute({ text, replyTo }, object, signal) {
          const { connectionId, ...address } = binding(object);
          const message = await (await capture().get(connectionId)).sendMessage({ ...address, text, ...(replyTo ? { replyTo } : {}) }, { signal });
          object.commit(writer => { writer.append(ChatMessageSent, message); });
          sent(connectionId, address, message);
        } })],
      }),
    ],
    tools: [
      capturedTool(captured => implementTool(ConversationsList, {
        async call(_data, target, _args, { signal }) { return { kind: "succeeded", data: await list(captured(), target, signal) }; },
      })),
      implementTool(ConversationsSubscribe, {
        async call(_data, target, { enabled }, { object }) {
          configure(object, target, enabled);
          return { kind: "succeeded", data: { target, enabled } };
        },
      }),
      capturedTool(captured => implementTool(ChatRead, {
        async call(data, target, _args, { signal }) {
          const { connectionId, ...address } = data;
          return { kind: "succeeded", data: await (await captured().get(connectionId)).readMessages({ ...address, ...target }, { signal }) };
        },
      })),
      capturedTool(captured => implementTool(ChatSend, {
        async call(data, target, { parts }, { signal }) {
          if (parts.some(part => part.kind !== "text")) throw new MessagingError("unsupported", "This messaging operation accepts text parts.");
          const text = parts.map(part => part.kind === "text" ? part.text : "").join("\n");
          const { connectionId, ...address } = data;
          const message = await (await captured().get(connectionId)).sendMessage({ ...address, ...target, text }, { signal });
          sent(connectionId, address, message);
          return { kind: "succeeded", data: message };
        },
      })),
    ],
  };
});

export const messagingCreations = [
  defineAgentCreation({ id: CreateConversations.id, creation: CreateConversations,
    description: "Create a Conversations resource. It lists messaging connections and their conversations and manages notification subscriptions.",
    inputSchema: z.strictObject({ expose_self: z.boolean().optional().describe("Expose yourself to this resource to receive subscribed notifications.") }),
    toInput: () => ({}), toOptions: ({ expose_self }) => ({ exposeSelf: expose_self }),
    guidelines: ["A connection subscription reports new conversations; a conversation subscription reports incoming messages. Notifications are delivered to Agents exposed to the resource."] }),
  defineAgentCreation({ id: CreateChat.id, creation: CreateChat,
    description: "Create a Chat resource bound to an external conversation. It provides read and send tools and delivers incoming message events to exposed Agents.",
    inputSchema: chatCreateSchema.extend({ expose_self: z.boolean().optional().describe("Expose yourself to this Chat to receive incoming message events.") }),
    toInput: ({ expose_self: _expose, ...input }) => input,
    toOptions: ({ expose_self }) => ({ exposeSelf: expose_self }),
    guidelines: ["The new resource is linked to its creator. Connection and conversation IDs come from list results, external events, or explicit user input."] }),
];
