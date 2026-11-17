# Plugin-provided connections and GitHub resources

Filed: 2026-11-17
Status: Deferred, long-term exploration. Record the initial discussion and refine it incrementally when requested. No implementation or further design work is authorized by this plan.

## Purpose and user intent

Explore a reusable mechanism through which plugins offer configurable connections that users can configure and then use as resources. GitHub is the motivating example: a user supplies a token, agents can inspect pull requests and issues, and users can browse and operate on the same service through the application interface, potentially including replies to other people.

The user requested retaining this topic as a long-term plan rather than implementing it or continuing the design now. The architectural directions below are candidates from the initial discussion, not approved product decisions or SDK contracts.

## Candidate conceptual split

Distinguish three responsibilities without necessarily exposing three concepts in the interface:

- A plugin contributes a connection type, its configuration experience, and service-specific behavior.
- A saved connection holds reusable configuration and credential references outside an individual session.
- A session resource references a saved connection and, where useful, selects a working scope.

For example, one saved work GitHub connection could serve resources for different repositories in different sessions. Updating credentials would not require editing every resource. Removing a resource would not itself delete the saved connection.

A saved connection need not itself be a canvas resource. Whether this distinction should become an application-wide abstraction, rather than remain plugin-owned configuration, is still open.

Generalization would concern connection discovery, configuration, and reuse. GitHub should retain domain-specific resource state, tools, and views rather than being reduced to a universal action/payload interface. Resource types and tool implementations remain peers under the existing architecture.

## Candidate responsibility boundaries

If connections become an application-wide capability, consider host ownership of connection identity, plugin ownership metadata, shared configuration management, storage support, and change notifications. The SDK would expose the relevant domain contracts; plugins would own authentication behavior, remote account identification, validation, resource creation, domain operations, and presentation.

A possible creation experience is to choose GitHub, select or add a saved connection, choose a working scope, and create the resource. A separate settings entry could manage reusable connections. This flow is a proposal, not an approved interaction design.

Simple configuration could use generated forms, but custom plugin interfaces may be needed for authorization flows. A universal form language, OAuth framework, synchronization engine, connection pool, retry policy, or health-check protocol is not established as a requirement.

User actions and model tools could call a shared plugin-owned business service through their respective resource-action and tool entry points. User operations need not masquerade as model tool calls.

## Existing capabilities observed during the discussion

The SDK already exposes foundations that may be reusable:

- Plugin configuration contracts and host-managed configuration handles (`packages/sdk/src/config.ts` and `packages/sdk/src/runtime.ts`).
- Backend plugin secrets and plugin-scoped lifetimes (`packages/sdk/src/runtime.ts` and `packages/sdk/src/runtime-contracts.ts`).
- Plugin-owned resource creation input views, cards, settings pages, and resource actions (`packages/sdk/src/renderer-creation.ts`, `packages/sdk/src/renderer.ts`, and `packages/sdk/src/runtime-resources.ts`).

The current `PluginSecrets` contract describes credentials stored as given in the plugin's managed directory. It does not establish an encrypted vault or OS keychain guarantee. Any stronger credential-storage claim or change requires separate investigation and authorization.

These observations do not establish that a generic saved-connection registry already exists or that no SDK changes would be needed. Recheck current implementation when this work resumes.

## Boundaries to preserve in later design

- Configuring a connection does not automatically grant every agent access. Resource identity, captured links, and execution policy continue to determine request access; remote token permissions are a separate boundary.
- Credentials should not become ordinary model creation arguments, resource snapshots, or conversation history. A candidate model-facing creation contract would reference an existing connection; user credential entry would use a configuration surface.
- Configuration and credentials used by model operations must fit request-boundary capture semantics. Changes apply to subsequent requests rather than silently changing an in-flight request's environment.
- External writes are not undone by resource removal or history navigation. A comment submission with uncertain delivery must not be silently repeated merely because the response was lost.
- Domain behavior and model-facing tool guidance remain plugin-owned. A shared connection mechanism should not move GitHub business semantics into the host.

## Decisions still required

1. **Abstraction ownership:** Is a common saved-connection layer justified, or should GitHub initially use existing plugin configuration and resource mechanisms? What concrete shared responsibilities warrant a host/SDK capability?
2. **Resource meaning:** Does the first GitHub resource represent an account-wide workspace, a repository workspace, or another explicit scope?
3. **Scope semantics:** Is a selected repository merely a default filter, or an enforced restriction on resource operations? The interface must not imply the latter unless tools enforce it.
4. **Object granularity:** Do issues and pull requests remain locations within a GitHub resource, or become independently created resources for particular workflows?
5. **Connection lifecycle:** How should missing, edited, or deleted connections affect existing resources? Which settings survive removal, restart, or plugin unavailability?
6. **Authentication:** Which token types, account configurations, and GitHub hosts are initially supported? Are credential-storage changes needed? OAuth is not yet a requirement.
7. **External writes:** Which reply and mutation operations are included, and may agents perform them directly or only after user confirmation?
8. **User/model parity:** Which browsing and operation surfaces should be shared, and how are results and external effects represented in history?

## Resumption

Leave this plan deferred until the user chooses to revisit it. Future discussions can resolve individual questions and record explicit decisions here without treating the remaining proposals as approved. Determine implementation scope and validation requirements only after the relevant product and contract decisions are made.
