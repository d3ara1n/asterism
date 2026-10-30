# Engineering glossary

These terms distinguish the concepts used when developing Asterism. Each definition states its meaning without prescribing an implementation shape.

## Objects and views

| Term | Meaning |
| --- | --- |
| Workspace | Persistent ownership of application configuration, sessions, and templates |
| Session | A piece of ongoing work with one record tree and execution cursor |
| Agent configuration | Reusable instructions, model defaults, and execution budgets |
| Agent | Execution resource whose conversation projects session history |
| Resource | Stable object identity, type, state, and lifecycle |
| Resource presence | Membership in a session’s current reconstructed resource set |
| Resource link | Directed relation from an available resource to a receiver |
| Link receiver | Resource whose type accepts links |
| Card | A view of a resource |
| View state | Presentation choices outside historical records |
| Retained object state | User-created frontend state retained while an object remains present |
| Item view state | Per-conversation-item choices retained across virtualization |
| Focus island | Leading surface presenting an object outside its canvas card |
| Auxiliary panel | Supplemental view inside an object surface |
| Workbench template | Static resource data, links, and arrangement used to create a new session |
| Archive | End session resource lifetimes and move the session out of normal lookup |
| Recovery point | Saved application data used for storage recovery, separate from resource history |

## History and execution

| Term | Meaning |
| --- | --- |
| Session tree | Immutable records and their parent relationships |
| Timeline | Ancestor path from the logical beginning to one endpoint |
| Execution cursor | Persisted endpoint that receives new appends |
| History selection | UI candidate that has not changed the execution cursor |
| Branch | Presentation of an alternative continuation |
| Fork | Append a new continuation at a position that already has descendants |
| Snapshot | Fixed observation boundary, not an implicit restoration capability |
| Current data | Latest session/object values, independent of history reconstruction |
| Record source | Host-stamped emitting plugin and optional resource |
| Message sender | Origin of Agent input, distinct from its receiving record writer |
| Turn | Agent processing of a batch of inputs and steering additions |
| Request | One model response and its tool batch |
| Block | Output organization and persistence unit |
| Model projection | Request-specific representation of historical facts |
| Request environment | Configuration, credentials, context, and access captured for one request |
| Compaction | Summary substitution in model input while retaining original history |
| Resource busy | Active work that depends on the current timeline |
| Settled | Relevant work has actually finished, including required cleanup |
| Last write wins | Later backend-processed writes replace earlier current values |
| Continuation data | Protocol-native supplemental data reusable within its recorded scope |
| Request diagnostics | Recorded structure and measurements, not a complete request replay |

## Extensions and content

| Term | Meaning |
| --- | --- |
| Plugin | Installation, identity, dependency, settings, and lifetime unit |
| Feature module | Composed plugin contributions for a capability |
| Composition root | Code that connects explicit services and contributions |
| SDK | Shared host/plugin declarations and interfaces |
| Public API package | Domain contracts shared with an implementation, not another plugin |
| Public provider | Host binding of a public package to its implementation and exports |
| Creation contract | Typed resource initialization input and identity |
| Action contract | Typed object operation for application or plugin code |
| Call contract | Typed request/result communication with declared scope |
| Event contract | Typed transient occurrence or snapshot notification |
| Object channel | Bidirectional object-scoped data stream |
| Reader | Bound observation facade |
| Executor | Bound facade that adds controlled mutation |
| Lifetime | Cancellation signal and owned cleanup scope |
| Top-level tool | Static operation directly declared to the model protocol |
| Resource tool | Operation selected for a linked resource through dispatch |
| Tool implementation | Resource-specific target, result, and handler for a tool contract |
| Target | Implementation-defined location within a selected resource |
| Tool outcome | Final success, rejection, failure, cancellation, partial result, or unknown effect |
| Agent creation entry | Built-in domain adapter exposing resource creation to models |
| ContentRef | Reserved JSON value identifying immutable bytes |
| Content lease | Temporary retention during drafts, work, or reads |
| Content root | Persistent ownership from a record, current value, or template |
| Presentation | Typed data interpreted by a compatible display consumer |
| UiText | A literal string or owned message descriptor |
| Skill | An instruction package read selectively by name |

## Providers and measurement

| Term | Meaning |
| --- | --- |
| Model provider connection | Protocol, endpoint, credentials reference, and model list |
| Provider preset | One-time template for a model connection |
| Model expression | Provider identity plus full service model ID |
| Model target | Role with optional model and thinking overrides |
| Model role | Reusable model selection |
| Thinking level | Shared explicit selection mapped into protocol effort or budget |
| Compatibility pack | Finite declared adaptation, explicitly enabled |
| Reference price | Current rate used to estimate request cost |
| Account usage | Observed balance, quota, or rate-limit headroom |
| E2E output rate | Reported output divided by measured request duration |
| Web provider | Registered service type for search and/or URL retrieval |
| MCP Host | Resource entry into the shared MCP server collection |
| Terminal idle | Shell prompt readiness, not proof that all jobs completed |
