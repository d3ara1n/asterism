# Core concepts

Asterism is a local workbench for working with agents. A session keeps the work together; resources supply material and capabilities; cards show the objects involved.

## Sessions and agents

A **session** contains the inputs, objects, relationships, and history for a piece of work. Several agents can share a session. Each agent has its own conversation, derived from that session’s current history.

An **agent configuration** describes reusable behavior, including instructions, model selection, and execution budgets. An **agent** is a running workbench object created from a configuration. Changing which configuration an agent uses does not create a new session.

## Resources, links, and tools

A **resource** is an object with an identity and a type. A directory, note, terminal, or another agent can be a resource. A path or URL in a message is information; the corresponding capability comes from a resource.

A **link** makes a resource available to a receiver, such as an agent. The arrow points from the resource to the receiver. Access in the opposite direction requires its own link.

A **tool** performs an operation. Available resource tools depend on the resource type, its link to the agent, and the execution environment. Tool visibility and card visibility do not establish access.

Links control the objects supplied to a model and checked by resource operations. Shells, terminals, plugins, and MCP servers run with the current operating system user’s capabilities. Links are not an operating system sandbox.

Each model request captures its configuration and resource access for that response and its tool calls. Changes made during a response take effect in the next request.

## Cards and object lifetime

A **card** is a view of an object. Moving, folding, or hiding a card changes presentation. Removing the object changes the session and ends its resource lifetime when applicable.

Opening another session does not stop background work. Archiving a session or exiting the application ends its running resource instances.

## History and current state

A session records history as a tree. Its **current timeline** is the path used for continuing work. Browsing history selects a candidate; explicitly continuing from a position changes the current timeline.

Continuing from an earlier position and adding new work creates a **branch**, preserving the earlier continuation. This changes which history and objects are active. External files and current note contents retain their current values. Restoring resource contents requires support from that resource.
