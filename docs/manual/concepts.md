# Core concepts

Asterism is a local workbench for working with agents. A session keeps the work together; resources supply material and capabilities; cards show the objects involved.

## Paradigms and workflows

An **Agent paradigm** describes a general model of interaction and organization. The main paradigm is ordinary one-to-one assistance between a user and an Agent. Resources form the shared foundation across paradigms. Plugins supply capabilities: builtin can support both one-to-one assistance and Router–Worker coordination through roles and communication resources. Paradigms and plugins are not one-to-one.

A **workflow** is the user-defined arrangement of responsibilities, methods, handoffs, and completion criteria. Assistant roles, skills, and the workbench arrangement express it using available capabilities; a workflow can apply or combine organizational models. Harness text describes available primitives and execution contracts rather than prescribing workflows.

## Sessions and agents

A **session** contains the inputs, objects, relationships, and history for a piece of work. It can exist independently of an Agent conversation. In builtin, several Agents can share a session, each with its own conversation derived from that session’s current history.

In builtin, an **agent configuration** describes reusable responsibility and behavior. A workbench **Agent** carries out work in its own conversation. Reusing a configuration does not mean sharing that conversation or its resource access.

A message can be a user request, another Agent’s report, or an event from a resource. Its source matters when deciding how to interpret it: a report or event supplies information, not the user’s approval for a new scope of work.

## Resources, links, and tools

A **resource** is an object with an identity and a type. A directory, note, terminal, or another agent can be a resource. A path or URL in a message is information; the corresponding capability comes from a resource.

A **link** makes a resource available to a receiver, such as an agent. The relationship is directed: access in the opposite direction requires its own link. Sharing a session or working toward the same goal does not imply mutual access.

A **tool** performs an operation. Available resource tools depend on the resource type, its link to the agent, and the execution environment. Tool visibility and card visibility do not establish access.

Links control the objects supplied to a model and checked by resource operations. Shells, terminals, plugins, and MCP servers run with the current operating system user’s capabilities. Links are not an operating system sandbox.

Each model request captures its configuration and resource access for that response and its tool calls. Changes made during a response take effect in the next request.

## Cards and object lifetime

A **card** is a view of an object. Moving, folding, or hiding a card changes presentation. Removing the object changes the session and ends its resource lifetime when applicable.

Opening another session does not stop background work. Archiving a session or exiting the application ends its running resource instances.

## History and current state

A session records history as a tree. Its **current timeline** is the path used for continuing work. Browsing history selects a candidate; explicitly continuing from a position changes the current timeline.

Continuing from an earlier position and adding new work creates a **branch**, preserving the earlier continuation. This changes which history and objects are active. External files and current note contents retain their current values. Restoring resource contents requires support from that resource.
