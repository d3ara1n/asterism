# External conversations

Messaging lets an Agent use external private chats and groups through resources. Configure a connection in Settings → Providers → Messaging connections. Each connection represents an external identity, such as a Telegram Bot. Multiple connections may use the same provider.

A connection's status shows whether it is receiving. Connecting and reconnecting retry automatically after temporary failures such as a lost network; reconnecting shows the failure being retried. Failed means the platform rejected the connection, for example because of an invalid token or another receiver; fix the cause and reconnect from settings. Removing a connection also deletes the observations its provider retained for it.

Create a Conversations resource to browse connections and their conversations. Open a connection to see its conversations and toggle notifications with the bell buttons. The list is for viewing and does not create resources. A Chat resource binds one specific conversation; the user or an Agent creates it explicitly by choosing a connection and an observed conversation, or by entering a conversation ID. Topic IDs narrow a Chat to a particular topic. Open cards refresh when new messages arrive or are sent.

Links determine communication. Link a resource to an Agent to make its tools available. Expose an Agent to the resource to receive its events. These directions are independent. Connecting several private chats, groups, or platforms to the same Agent uses that Agent's existing context. Create separate Agents when separate contexts are wanted. When an Agent is exposed to several resources that match the same message, it receives that message once, from the Chat when one matches.

Conversations notifications are off initially. Subscribe to a connection to hear about newly discovered conversations, or to a particular conversation to hear about incoming messages. The list's notification reports activity; the Agent can open a Chat and read messages for content. Subscriptions are saved in session history and follow its current path. Notifications reach resources in sessions open in the running application.

The list tool accepts a null target for connections and a connection target for conversations. Providers may return a cursor. Passing that cursor in a later query asks for subsequent changes without changing another reader's position. Chat reads can also return cursors. Query results remain in tool history; no separate read marking is required.

A Chat read with a `messageIds` array retrieves specific retained messages, such as a message identified by `replyTo`, within the Chat's conversation and topic. It returns found messages in requested order, once per resolved message, and lists unavailable IDs in `missingIds`; this query returns no cursor.

Each message's sender has a role: self for the connection's own identity, participant for others, and system for platform notices. Messages the connection sent itself are not delivered back as events.

Agents send external messages with the Chat's send tool. Their ordinary responses appear in Asterism. Define communication responsibilities in Agent instructions or linked notes.

## Images and files

Messages contain ordered text and file parts, and each attachment carries a FileRef. A new-message input attaches its images to model input within the application's file limits, so an Agent can inspect them directly while retaining the reference for saving or forwarding. An image that exceeds the limits or cannot be fetched stays a reference with a note explaining why. Chat reads and sends return references only; the Chat's `see` tool fetches an image by message ID and file ID when an Agent wants to look at it.

Chat cards, Agent inputs, and message tool results show attachments, with consecutive files grouped together. Images within the model file size limit show a preview; click one to open it. **Save as…** opens the system file dialog for any attachment and saves to the location you choose. An Agent can instead use a linked Directory's `save` tool with a destination path and the attachment's FileRef.

Images attached to an Agent input remain available with that input. References fetch the current platform content when consumed, so they require the Chat to exist on the current session path, its connection to be available, and the remote file to remain downloadable. Older text-only observations retain their original descriptions and do not acquire attachment identities retroactively.

## Telegram Bot

Create a bot with Telegram's BotFather and enter its token in a Telegram Bot connection. The connection uses long polling while Asterism is running. An existing webhook or another active polling client prevents polling; the connection reports the failure, and reconnecting resumes once the other receiver is gone. Rate limits are retried after the delay Telegram requests.

Telegram Bot API does not provide a general conversation list or arbitrary chat-history retrieval. This provider lists conversations observed by the connection and reads messages it has retained locally. Group privacy settings determine which messages Telegram delivers. A newly configured bot does not gain access to earlier group history.

The integration preserves captions and attachment metadata, sends text and referenced files, supports replies by message ID, and preserves topic addresses. A single still image within Telegram's photo limit is sent as a photo and other files as documents; several files are sent as one album with the text as its caption, as documents unless all are photos. Telegram accepts at most 10 files per send and 50 MB per uploaded file.

Telegram delivers an album as one message per item. Each item keeps its own message ID, body, and attachments, and items share a `groupId`. The connection waits briefly for the remaining items and delivers them together as one Agent input. Replies address individual items. Sending an album returns the first item's receipt; all sent items are available in Chat history. A received reply also retains its attached original message when that message was not previously observed, making it available to ID reads.

Received photos select the largest available variant; downloads through Telegram's hosted Bot API are limited to 20 MB. Incoming edits update retained messages without emitting a new-message notification. Provider observations survive connection restarts and are shared across resources.

## Discord Bot

Create an application in the Discord Developer Portal, enable its bot, and copy its bot token into a Discord Bot connection. Enable **Message Content Intent** on the Bot page. Install the bot in the server with the `bot` scope and channel permissions to view channels, read message history, send messages, send messages in threads, and attach files. The channel's permission overrides still apply. Private messages use the bot's Discord identity.

Receiving uses the Discord Gateway. The connection reports reconnecting while the SDK restores an interrupted session, connected after recovery, and failed when the Gateway rejects the session. A thread is addressed by its parent channel ID plus the thread channel ID as the topic. A direct chat or ordinary channel uses its channel ID alone; direct chats are titled by the other participant. Text messages are limited to 2,000 characters and a send accepts at most ten files; file size limits are enforced by Discord. Downloading an attachment fetches its message to refresh the signed download URL, so the bot still needs access to that message and channel.

## Slack Bot

Create and install a Slack application in the workspace. Enable Socket Mode and create an app-level token with `connections:write`. Enter this `xapp` token and the installed application's `xoxb` Bot User OAuth Token in the Slack Bot connection.

Enable the bot message event subscriptions needed for its conversations: `message.im`, `message.mpim`, `message.channels`, and `message.groups`. Grant their corresponding history scopes: `im:history`, `mpim:history`, `channels:history`, and `groups:history`. The connection uses `users:read` to identify the bot's application and `chat:write` to send messages. File sends also use `files:write` and `files:read` to upload files and obtain the shared message's identity. Reinstall the app after changing scopes. Invite the bot into the channels it should participate in; enable the App Home Messages tab for direct messages.

A Chat uses the Slack conversation ID. Its optional topic is the root message's timestamp, preserved as a string. Replying to an observed child message uses that child's root thread. Only events for the bot token's workspace are retained; events from a different application report mismatched tokens. Files and their accompanying text are shared together. Receiving file content uses `files:read` and authenticated downloads of Slack-hosted files; external remote files are not downloaded with bot credentials. If Slack accepts an upload but its message identity cannot be retrieved, the operation reports an uncertain outcome rather than declaring that nothing was sent.

## QQ Bot

Create a robot in the QQ Bot Open Platform and enter its AppID and AppSecret in a QQ Bot connection. Enable the private and group message permissions needed in the platform console and configure sandbox members and groups for testing. Receiving uses the official SDK's WebSocket Gateway while Asterism is running.

A conversation ID is `c2c:<user_openid>` for private chats or `group:<group_openid>` for groups. These platform identities are distinct from QQ account numbers. The provider retains received and sent messages locally; QQ does not provide earlier conversation history. Group messages delivered by the platform are observed whether or not they mention the bot. Platform permissions determine which events are delivered.

The provider sends text. A reply uses the selected incoming message ID; sending without a reply target requests a proactive message. QQ controls reply validity, message quotas, and sending permissions, and its refusals appear as operation errors. Received attachments retain file references and can be opened while their platform URLs remain available. File sending and topics are unsupported by this provider.

Incoming replies preserve their reference identifier. When the referenced message was observed, the provider resolves QQ's separate reference index to that message's ID. ID reads accept either identifier; unavailable originals appear in `missingIds`.

## Observed conversations and connectivity

Discord and Slack connections list conversations in which they have observed incoming or outgoing messages. Their reads return retained local observations, including messages sent through Asterism; they do not backfill earlier platform history. Names absent from an event appear as platform IDs. Thread reads include an observed root message. Identical redeliveries do not trigger another Agent input. Discord edits update messages available in the SDK cache, and Slack edit events update retained messages without triggering a new input. Deletions and reactions are not synchronized.

These integrations use official bot accounts and need no public callback URL. Receiving requires Asterism to be running and the platform to be reachable. HTTP requests use the application's fetch transport. The Discord Gateway, Slack Socket Mode, and QQ Gateway WebSocket connections are managed by their SDKs and do not take the application's HTTP proxy setting; networks that require a proxy for these connections need routing outside the application.
