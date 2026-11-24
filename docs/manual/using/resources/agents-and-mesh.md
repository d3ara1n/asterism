# Connect Agents directly or through Mesh

A workbench Agent is a continuing conversation with its own instructions and resource access. It can also be made available as a resource to another Agent. Mesh connects Agents through a shared channel, including across sessions. Choose a direct relationship when the participants are already known; choose Mesh when participants need to discover one another within a channel.

## Agent: a conversation, not a copy of the caller

Giving a coordinator access to a worker Agent lets it communicate with and investigate that worker through the supported operations. It does not merge their model contexts or give the coordinator the worker's directories, notes, or services. A worker's report is evidence of what it says it did, not direct access to its output.

The reverse communication route is independent. A coordinator can be able to send an assignment while the worker has no route for sending a report back. Make both relationships explicit when the work needs two-way communication. Shared files or Notes need their own access for each participant.

Being available as an Agent resource includes investigation of saved conversation records, not just delivery to an inbox. Consider that visibility when deciding who should be connected. Separate conversations provide separate contexts, but publication to another participant is a deliberate relationship.

Input acceptance, execution ending, and acceptance of the deliverable are separate events. A supervisor relationship requires an agreement about reports, evidence, and follow-through; the link alone does not schedule work or make a final response a verified result.

### Attachments and local paths carry different information

Drop a local file as an attachment to include its contents in a model request, or insert its path to name the file in the draft without attaching it. A local path is ordinary message text; it does not give the Agent access to the file. If the Agent needs to open the file itself, it needs an appropriate linked resource or tool.

Moving a conversation to a different model can change how earlier attachments are used. Supported media within the inline limit goes directly to the model; other message attachments appear as local file paths the Agent can open through a Directory resource. A path by itself does not mean the model has read the file. Changing models does not change the original attachments in history.

### Running work is broader than a model response

An Agent remains active through its task, including waiting for tools or answers, retry delays, and automatic context compaction. A pause in streaming is not by itself evidence that execution has ended. Stopping requests cancellation; the activity remains until the task and its cleanup have settled. Cancellation does not imply that the Agent needs your attention or that completed external effects were undone.

Manual compaction is separate work on the conversation's context. Its success or error notice concerns that compaction, not whether an earlier answer succeeded. Compaction does not revise the original history or establish that the underlying task is complete.

The compaction event marks when the summary was created, not where retained original messages begin. A freshly loaded conversation starts its readable range with that summary followed by the retained originals; pagination can initially hide the summary along with other earlier content. An already open reading window keeps its older material after another compaction, so seeing originals there and a summary after reloading are both expected. Expanding the summary reveals its text rather than restoring the older messages. The independent history view preserves the actual sequence of records.

A tool's attention notice calls you to its occurrence, not necessarily to a blocked task. A question remains unanswered until it is answered, skipped where allowed, or cancelled through its interaction. Viewing the session or dismissing an enlarged question view does not resolve it, even when the session reminder has disappeared.

### Sharing an excerpt is different from publishing an Agent

A shared excerpt is a static artifact for someone to read outside the workbench, not a connection to the Agent. It does not give its recipient access to the conversation's records or resources. The excerpt keeps the selected messages as they were when sharing opened; later output does not update it. This makes it useful for showing a question and its answer without publishing the full working context.

The image is laid out independently of the Agent card, so a narrow workbench view need not produce a narrow image. It remains one long image rather than a set of pages. Extremely long excerpts can exceed the browser's image limits; a smaller selection or Markdown is more suitable in that case. Sharing includes input text and final replies, not the execution trace or runtime measurements. Attachments remain names rather than embedded file contents. Internal references are labels in the image; Markdown retains their original syntax, whose destinations still belong to the originating workbench and are not public links.

### A default role is a starting choice

The default role selected in Agent settings is the starting choice for a new conversation on the home page, not a policy for every Agent. Choosing a different role for one conversation does not change that preference, and changing the default does not reconfigure existing Agents. The selected role supplies its instructions and model role; the default preference does not maintain a separate copy of those settings. The factory default has no role instructions and is reserved for user-created conversations unless you allow assistant use.

Disabling the selected role, or deleting or renaming a selected custom role, leaves its default reference unavailable rather than silently switching to another role. Choose a new default in settings, or select an available role for the conversation before sending.

## Mesh: access and membership are different directions

A Mesh resource belongs to one selected channel. Participating sessions can use separate Mesh resources with the same channel selection. Merely giving them similar card titles does not establish a shared channel.

Making the Mesh available to an Agent lets that Agent use the channel. Making an Agent available to the Mesh publishes the Agent as a member that other channel users can discover, message, and investigate. These directions are independent. An Agent can receive a message without having access to the Mesh needed to reply through it.

Membership does not share the member's underlying resources or turn the channel into one shared model context. Pass relevant findings deliberately and give participants separate access to material they must verify. Publication also permits supported investigation of saved records; it is more than opting into notifications.

### Membership follows live relationships

Hiding a Mesh card does not leave the channel. Switching its selected channel changes where its exposed Agents participate while retaining the workbench links. Removing an Agent's last exposure path to the channel, sleeping its session, or archiving it removes that membership. Waking or restoring the session rebuilds membership from the restored relationships.

An in-progress request uses the channel and members captured when that request began. A channel switch or link change therefore need not affect a response already underway; subsequent requests see the new arrangement.

Names and numeric disambiguators identify current members, not permanent identities for future assignments. When membership changes, establish the current recipient rather than assuming an old name-and-number pair is a durable address.

### A task description is not an Agent configuration

Descriptions saved through a Mesh describe an Agent's work on that Mesh resource. They do not replace its role instructions or grant additional capabilities. One Agent can be exposed through several Mesh resources, and channel listings can combine its descriptions. Use those descriptions to help participants find relevant collaborators, while keeping responsibilities and completion criteria in the actual task agreement.
