# Object model

This document owns domain semantics. TypeScript declarations, database schemas, and tool argument shapes remain in source.

## Workspace and session

A workspace owns global configuration, capability providers, sessions, templates, and application data. Its storage directory grants no implicit model access to files.

A session is the unit of ongoing work. Its generated ID is identity; its title is presentation. Home has no session identity. Accepting the first input or instantiating a template creates one.

Each session owns one history tree and an execution cursor. A conversation is an agent-specific projection of that tree’s current timeline, not an independently stored message array. A session can exist without an agent.

Archiving ends the session’s object lifetimes before marking it archived. Normal session and resource lookup then treats it as absent. A separate recycle-bin directory exposes archived sessions for restoration. Restoration clears the archive marker and reattaches objects.

Startup collection deletes sessions older than the retention threshold. It removes their dependent rows and content roots as a whole. The threshold is an implementation constant, and deletion timing depends on startup.

## Workbench templates

A template is workspace-owned static data: selected resource types, reusable titles, creation data, explicitly selected object-scoped current data, links, and card arrangement. Resources opt into this copying behavior and declare their reusable current-data contracts. A resource may also declare title generation for template instances: saving then omits its title, and each instance receives a generated title. Resources without this declaration retain their saved titles. It contains no conversation history, session-scoped current data, private files, viewport, local panel state, or running external instance.

Saving captures current values independently of later source changes. Instantiation creates a session and fresh resource identities in one transaction. Internal object references in the template’s relationship structure map to new identities; arbitrary domain JSON retains its values.

The host validates resource availability, template support, creation data, declared current data, and link eligibility. Saved data that the installed resource no longer accepts fails explicitly. The host initializes objects from saved data without rerunning creation forms or handlers. Failure rolls back the transaction. New history records object creation and links.

Templates independently retain the immutable bytes referenced by their saved data. Deleting a template does not affect sessions already created from it.

## Agents

An agent is an execution object and can also be a linked resource. Its controller projects context, resolves the request environment, and drives model and tool calls.

Agents have no intrinsic parent-child hierarchy. Delegation composes creation, links, and communication. Creating another agent does not expand the caller’s own tool policy.

An explicit creation title supplies the initial name; otherwise the built-in Agent chooses a display name once. Agents created from templates always generate a random display name, including when the source agent was explicitly named. Display names can repeat and do not identify operation targets.

System instructions belong to the request environment. The timeline stores actual input and output records, not a second copy of the environment.

## Resources and current data

A resource has stable identity, type, lifecycle, and presentation. Tools independently declare which resource types they support. Resource definitions contain neither a tool catalog nor a tool policy.

Creation establishes identity, initial data, history, and optional links together. A resource’s static display descriptor supplies its type name and icon independently of its current data or card renderer.

Resource titles belong to the timeline. Renaming appends an event, and each branch reconstructs the title from its own path. Identity, type, links, creation data, and external locators remain unchanged. Frontend and tool operations share the host rename mechanism; tool targets must belong to the request's captured linked resources.

Resource categories differ in what Asterism owns:

| Category | Owned state | Historical behavior |
| --- | --- | --- |
| External reference | A path or other locator | Inspection reads current external state |
| Self-contained object | Current domain data | Historical reconstruction requires explicit records and projection |
| Agent | Configuration selection and controller state | Conversation projects the current timeline |

Current session and object data is scoped by typed data contracts. Saving it does not append a historical event. Cursor changes and branches do not copy or restore these values.

Notes store current text. External files remain external. A URL is input to a capable resource, such as the built-in Web resource, rather than an implicit new object.

## Resource presence and removal

The current timeline determines resource presence. Creation or cursor movement can make an identity appear; removal or moving before its creation can make it disappear. Presence is independent of which session or card the user views.

An identity present in both old and new projections retains its lifetime. Reappearing objects use saved identity, creation data, and current data; their provider initializes any external instance.

Removal requires the target’s timeline-dependent work to be settled. It neither implicitly cancels work nor queues behind it. A successful removal records the event and removes all incoming and outgoing links. Historical records and external files remain.

The resource lifetime handles cleanup of owned external instances. Hiding a card does not end that lifetime. Shutdown waits for cleanup to finish.

## Directed links

A link points from the resource being made available to its receiver. The receiver’s resource type declares whether it accepts links. Endpoints must be distinct resources in the same session’s current path.

Opposite directions are independent links with independent history. Runtime operations also check tool support, external policy, and captured request access. Card identity, location, and visibility do not determine those checks.

## Tools and saved results

A tool contract owns its identity, meaning, argument schema, description, and usage guidance. Resource implementations own target and result schemas and execution behavior. Top-level tools declare their operation directly.

An operation’s saved outcome identifies the implementation actually used and the relevant resource at that time. Historical rendering uses those facts even if the current resource or implementation disappears. Unknown data remains available through fallback presentation.

Tool results are records, not a separate artifact entity. A diff view presents a tool result; a relationship inferred from a result does not create a second source of operation history.

## Views

A card is a view of an object. Position, folding, visibility, size, and viewport are view state outside the history tree.

Agent cards show the current timeline. History browsing and branch selection belong to the history panel.
