# External conversations

Messaging lets an Agent use external private chats and groups through resources. Configure a messaging provider in Settings → Providers → Messaging providers. Each configured provider is a connection that represents an external identity, such as a Telegram Bot. Multiple connections may use the same provider.

A connection's status shows whether it is receiving. Connecting and reconnecting retry automatically after temporary failures such as a lost network; reconnecting shows the failure being retried. Failed means the platform rejected the connection, for example because of an invalid token or another receiver; fix the cause and reconnect from settings. Removing a connection also deletes the observations its provider retained for it.

Create a Conversations resource to browse connections and their conversations. Open a connection to see its conversations and toggle notifications with the bell buttons. The list is for viewing and does not create resources. A Chat resource binds one specific conversation; the user or an Agent creates it explicitly by choosing a connection and an observed conversation, or by entering a conversation ID. Topic IDs narrow a Chat to a particular topic. Open cards refresh when new messages arrive or are sent.

Links determine communication. Link a resource to an Agent to make its tools available. Expose an Agent to the resource to receive its events. These directions are independent. Connecting several private chats, groups, or platforms to the same Agent uses that Agent's existing context. Create separate Agents when separate contexts are wanted. When an Agent is exposed to several resources that match the same message, it receives that message once, from the Chat when one matches.

Conversations notifications are off initially. Subscribe to a connection to hear about newly discovered conversations, or to a particular conversation to hear about incoming messages. The list's notification reports activity; the Agent can open a Chat and read messages for content. Subscriptions are saved in session history and follow its current path. Notifications reach resources in sessions open in the running application.

The list tool accepts a null target for connections and a connection target for conversations. Providers may return a cursor. Passing that cursor in a later query asks for subsequent changes without changing another reader's position. Chat reads can also return cursors. Query results remain in tool history; no separate read marking is required. Each message's sender has a role: self for the connection's own identity, participant for others, and system for platform notices. Messages the connection sent itself are not delivered back as events.

Agents send external messages with the Chat's send tool. Their ordinary responses appear in Asterism. Define communication responsibilities in Agent instructions or linked notes.

## Telegram Bot

Create a bot with Telegram's BotFather and enter its token in a Telegram Bot connection. The connection uses long polling while Asterism is running. An existing webhook or another active polling client prevents polling; the connection reports the failure, and reconnecting resumes once the other receiver is gone. Rate limits are retried after the delay Telegram requests.

Telegram Bot API does not provide a general conversation list or arbitrary chat-history retrieval. This provider lists conversations observed by the connection and reads messages it has retained locally. Group privacy settings determine which messages Telegram delivers. A newly configured bot does not gain access to earlier group history.

The integration reads text and media captions or labels, sends text and referenced files, supports replies by message ID, and preserves topic addresses. A single still image within Telegram's photo limit is sent as a photo and other files as documents; several files are sent as one album with the text as its caption, as documents unless all are photos. Telegram accepts at most 10 files per message and 50 MB per file. Received attachments are shown as labels and are not downloaded. Incoming edits update the retained message without emitting a new-message notification. Provider observations survive connection restarts and are shared across resources.
