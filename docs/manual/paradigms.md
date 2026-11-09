# Agent paradigms

Asterism is a local-first, resource-centered workbench. Resources, links, tools, history, and views form a shared foundation for different ways of working with Agents. Resource-centered design belongs to the whole workbench, not to one particular Agent paradigm.

## Paradigms, plugins, and workflows

A **paradigm** describes a general model of interaction and organization: how users engage with Agents, how participants divide responsibility, and how they coordinate. Ordinary one-to-one assistance, Router–Worker coordination, and peer collaboration are different organizational models.

A **plugin** supplies executable capabilities and interfaces. Paradigms and plugins are not one-to-one: one plugin's resources can support several paradigms, and capabilities from several plugins can participate in one paradigm. Adopting another paradigm does not inherently require another plugin or a different execution loop.

A **workflow** is the user's concrete arrangement for accomplishing work. It specifies responsibilities, methods, handoffs, and completion criteria through assistant roles, skills, task instructions, and a workbench arrangement with explicit resource links. A workflow can apply or combine organizational models using the available capabilities.

For example, Router–Worker describes a coordination model. A user defines its workflow by assigning the Router and Workers their responsibilities, choosing their communication routes, and specifying how this task is assigned, reported, and accepted. Assigning a supervisor to follow through with another Agent is likewise a user-defined workflow, not a requirement to install another execution system.

The harness is the model-facing description of the execution environment, including infrastructure prompts, tool descriptions, and operation feedback. It describes primitives and their contracts. Users define workflows; the harness does not supply prescribed task sequences.

## The shared resource foundation

The host supplies sessions, resource identity and links, history storage, execution capabilities, and the workbench. Plugins supply resources, tools, views, and domain behavior. Model calls, terminal sessions, and MCP operations are capabilities that implementations can compose.

The builtin plugin provides conversational Agents as independently executing objects that can also be made available as resources. Agents can communicate through direct Agent links or Mesh channels. Subagent Pools provide task-scoped delegation and retained reports. These capabilities support more than the main one-to-one interaction model.

A session can contain several Agents alongside directories, notes, terminals, and other resources. Each built-in Agent has its own conversation derived from the session's current history. Sharing a session does not imply sharing model context or resource access.

Directed links determine available resources and communication routes. Card placement supports navigation and observation. Spatial proximity, names, and reporting relationships do not create authority. Resource access is a context and operation boundary, not an operating-system sandbox.

## The main paradigm: one-to-one assistance

The main paradigm is the familiar interaction between a user and an Agent: the user asks a question or gives a task, the Agent responds or acts using available tools, and the user provides clarification, feedback, or the next request.

There is no special coordination architecture implied by this interaction. Several such conversations can coexist on the workbench, with each Agent working from its own inputs and linked resources. The builtin plugin supplies this ordinary conversational experience together with capabilities that users can combine into other organizational models.

Users, other Agents, and resource integrations can submit messages to built-in Agents with source attribution. Accepted input starts an idle Agent; inputs to a running Agent are queued for the applicable request or turn boundary. Receiving messages from other sources enables coordination without requiring a separate kind of Agent.

## Other organizational models using built-in capabilities

The following models can be arranged with builtin resources, assistant roles, and user instructions. They are compositions, not separate installed modes or harness-provided workflows.

### Router–Worker coordination

The user assigns one Agent the Router role and others Worker roles. The Router maintains the user-facing conversation, distributes tasks, collects reports, and returns questions or results. Workers handle their assigned work in separate conversations.

The Router can communicate directly with linked Worker Agents or use Mesh to discover and contact participants, including across sessions. Return communication requires the corresponding route. Each Worker receives its own resource access; the Router's resources are not automatically inherited. A Subagent Pool is another option for bounded delegated tasks that do not need an ongoing workbench conversation.

This provides the Router–Worker organization associated with Super-agent-style systems without requiring a new plugin. The user defines dispatch responsibilities, reporting conventions, escalation, and completion criteria through roles, skills, and task instructions. Further properties of a particular Super-agent design, such as automatic crash recovery, are separate implementation claims rather than consequences of assigning these roles.

### Peer collaboration

Agents communicate directly without a permanent central dispatcher. Participants can specialize by subject or contribute different perspectives to a shared problem. Direct links or Mesh provide communication; shared resources provide material.

The user defines responsibilities, how findings are exchanged, and how open decisions are resolved. The collaboration model does not require a new Agent implementation or a built-in hierarchy.

### Blackboard-style collaboration

Participants coordinate around shared material such as a note or a set of files containing evidence, hypotheses, partial results, and unresolved questions. Agents consult and update that material according to the user's chosen conventions.

Built-in notes, directories, and communication resources can support this organization. Sharing a note does not itself notify participants or schedule their work; communication or an event-capable integration supplies the chosen activation mechanism. A plugin could add structured contributions, automatic activation, or specialized views where those capabilities are useful.

## Models that may benefit from additional plugin capabilities

Plugins extend the available primitives when a desired arrangement needs capabilities not supplied by its current resources. The following are possible extension directions, not additional bundled execution systems. Their implementation can reuse builtin capabilities rather than replacing the whole Agent experience.

### Dataflow and state-machine execution

Work becomes eligible according to explicit dependencies or state transitions. A node or state can invoke a model, perform an operation, collect user input, or wait for a result. A plugin could provide dependency evaluation, transition state, and a graph or state-oriented interface.

The user supplies the task graph, branching conditions, and acceptance rules. Conversational Agents can also follow user-defined plans and handoffs with existing resources; runtime-enforced graph execution is an additional capability. Workbench resource links establish access, not execution dependencies.

### Actor-style systems

Participants own local state and handle messages through mailboxes. A plugin could provide specialized state, message handling, persistence, and inspection when an application needs semantics beyond ordinary Agent conversations.

Builtin already supports independent Agents and message exchange. An actor-oriented extension can add the particular state and execution behavior needed by its use case, rather than treating every message-based arrangement as a separate plugin.

### External-runtime and terminal-centered systems

An external Agent runtime or interactive terminal can serve as the primary execution surface. A plugin could integrate its inputs, progress, cancellation, results, and saved state with the workbench while that runtime owns its internal execution loop.

A terminal running an Agent program is not automatically a structured integration. An integration defines which operations and observations it exposes. This direction lets users retain an existing execution environment and combine it with other resources and participants.

## Combining organizational models and implementations

A user can combine one-to-one assistance, routing, peer discussion, and shared-material collaboration with built-in resources. For example, a user-facing Router can assign work to a group of peers and discuss their combined result with the user. The user defines the workflow that connects these arrangements.

When a composition crosses implementation boundaries, resource tools or public domain APIs supply the supported interaction contracts. Sharing the host does not automatically make independently implemented systems interoperable. A plugin can expose task submission or result inspection without requiring the consuming Agent to adopt its internal representation.

Multi-paradigm support therefore comes both from composing existing capabilities and from extending them. A plugin boundary is an implementation boundary, not a boundary around every possible way of organizing Agents.
