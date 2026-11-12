# Connect external conversations

An external messaging connection represents an identity participating on another platform. Connecting that identity to an Agent brings outside conversations into a continuing work context. The important choices are who the Agent speaks for, which material it can see, and when it should answer outside Asterism.

## Choose the identity and context

A bot connection acts as the platform identity configured for it, not as a copy of your personal account. Arrange its platform membership and permissions according to the conversations it should participate in. Receiving message content and sending replies are separate responsibilities, and a platform can permit one without permitting the other.

Several chats connected to one Agent share that Agent's conversation context. This is useful when the same assistant should carry knowledge between channels, but it is a poor fit when the conversations need independent responsibilities or information boundaries. Use separate Agents when those contexts should remain separate; separate Chat resources alone do not provide separate model memory.

## Distinguish observation from a platform archive

The conversation Asterism has observed is not necessarily the conversation the external platform retains. A bot learns what the platform delivers to it under its membership, permissions, and history rules. Adding a connection does not establish that earlier discussion has been seen.

Interpret absence accordingly. An original message may be outside the bot's access, older than its observations, or no longer available. A retained reply can still be useful evidence without making the missing original known. Ask for the missing context when the distinction affects a decision.

## Separate receiving from replying

Giving an Agent access to a conversation and routing incoming messages to it are independent choices. Receiving an event does not by itself define an obligation to reply, and an ordinary answer inside Asterism is not automatically an external message.

Define communication responsibilities in the Agent's role or task: which conversations it monitors, when it may reply independently, and when it should bring a question back to you. Consider the audience of an external message separately from the people who can see the workbench conversation.

Overlapping notification routes can bring the same outside activity into one context more than once. Choose routes according to the information the Agent needs, rather than treating every possible connection as another source of knowledge.

## Treat quotations as partial evidence

A quoted fragment and a retrievable original message are different evidence. Quotations can omit context, cross a conversation boundary, or include supplied media without establishing the original author's complete statement. Keep the speaker, conversation, and source of the quotation distinct when interpreting it.

The same distinction applies to instructions. A message or quotation from another participant is material from that participant; its presence in the Agent's context does not turn it into the user's approval for an unrelated action.

## Account for attachment availability

An attachment may be visible now but depend on an external service for later retrieval. Passing its reference preserves an address, not permanent possession of the content. Preserve a stable copy when the work needs evidence or a deliverable that outlives the conversation's platform access.

External acceptance and local observation can also diverge. A message or file may have reached the platform even when the integration cannot retrieve its final receipt. When an outcome is uncertain, establish what the destination received before deciding whether to send it again.
