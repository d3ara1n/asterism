# Work with Conversations and Chat resources

An external messaging connection represents an identity participating on another platform. Connecting that identity to an Agent brings outside conversations into a continuing work context. The important choices are who the Agent speaks for, which material it can see, and when it should answer outside Asterism.

## Conversations: discover and choose what to follow

A Conversations resource represents the configured messaging connections and the conversations they expose. Use it when an Agent should discover outside conversations or receive notifications about selected activity without giving every conversation its own working card.

A subscription to a connection reports newly discovered conversations; it is not a subscription to every message in all its chats. Following a conversation is a separate choice, optionally narrowed to a thread. This distinction helps explain why an Agent can learn that a chat exists without receiving the discussion inside it.

## Chat: work with one external conversation

A Chat resource binds a particular external conversation, optionally narrowed to a thread. Use it when that conversation itself is part of the work: its messages, attachments, and reply destination belong together. Another Chat card for the same address reaches the same outside conversation, not a copied or private channel.

Conversations subscriptions provide message metadata, while a Chat can deliver message content to its receiving Agents. Choose the route according to whether the Agent needs awareness of activity or the discussion itself. Neither resource supplies platform history or permissions that the configured connection lacks.

## Choose the identity and context

A bot connection acts as the platform identity configured for it, not as a copy of your personal account. Arrange its platform membership and permissions according to the conversations it should participate in. Receiving message content and sending replies are separate responsibilities, and a platform can permit one without permitting the other.

Several chats connected to one Agent share that Agent's conversation context. This is useful when the same assistant should carry knowledge between channels, but it is a poor fit when the conversations need independent responsibilities or information boundaries. Use separate Agents when those contexts should remain separate; separate Chat resources alone do not provide separate model memory.

## Distinguish observation from a platform archive

The conversation Asterism has observed is not necessarily the conversation the external platform retains. A bot learns what the platform delivers to it under its membership, permissions, and history rules. Adding a connection does not establish that earlier discussion has been seen.

Interpret absence accordingly. An original message may be outside the bot's access, older than its observations, or no longer available. A retained reply can still be useful evidence without making the missing original known. Ask for the missing context when the distinction affects a decision.

## Separate receiving from replying

Making a Chat or Conversations resource available to an Agent lets it use that resource. Making the Agent available to the resource establishes it as a notification recipient; Conversations also needs the relevant subscription. These directions are independent, so read and reply access alone does not arrange incoming notifications. Receiving an event does not by itself define an obligation to reply, and an ordinary answer inside Asterism is not automatically an external message.

Define communication responsibilities in the Agent's role or task: which conversations it monitors, when it may reply independently, and when it should bring a question back to you. Consider the audience of an external message separately from the people who can see the workbench conversation.

Notifications depend on the receiving session remaining available. Hiding a resource card does not unsubscribe its recipients, but sleeping or archiving the session ends those live resource routes. Later platform access does not guarantee that every event missed during the absence will be delivered.

The configured connection's own outgoing messages are not echoed into Agent notifications. Agents sharing a Chat therefore do not automatically learn each other's external replies through that route, and a message sent from the Chat interface is not incoming Agent input. If collaborators need that context, they must read the conversation or communicate the result explicitly.

Overlapping notification routes can bring the same outside activity into one context more than once. Choose routes according to the information the Agent needs, rather than treating every possible connection as another source of knowledge.

## Treat quotations as partial evidence

A quoted fragment and a retrievable original message are different evidence. Quotations can omit context, cross a conversation boundary, or include supplied media without establishing the original author's complete statement. Keep the speaker, conversation, and source of the quotation distinct when interpreting it.

The same distinction applies to instructions. A message or quotation from another participant is material from that participant; its presence in the Agent's context does not turn it into the user's approval for an unrelated action.

## Account for attachment availability

An attachment may be visible now but depend on an external service for later retrieval. Passing its reference preserves an address, not permanent possession of the content. Preserve a stable copy when the work needs evidence or a deliverable that outlives the conversation's platform access.

External acceptance and local observation can also diverge. A message or file may have reached the platform even when the integration cannot retrieve its final receipt. When an outcome is uncertain, establish what the destination received before deciding whether to send it again.
