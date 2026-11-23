# Asterism project conventions

Asterism is an object-centered, plugin-based personal agent workbench for organizing work, resources, and execution history. Agent paradigms are plugin features; the bundled builtin plugin is the official paradigm.

## Engineering principles

- **Authorization is a context boundary.** Explicit resource identity and runtime authorization determine the objects visible and usable in a request. Storage directories, cards, links as visual elements, and tool catalog visibility are not implicit access grants or an operating system sandbox. Asterism has no general permission model. Auditability grows from attributable records, such as history, the usage ledger, and plugin-owned logs, whose identity comes from the request context, rather than from a separate audit layer. Shells, terminals, and MCP run as the current user.
- **Resources and tools are peers.** Tool implementations declare supported resources. Links activate matching capabilities; execution policy independently filters them. Resource definitions contain neither tools nor tool policy.
- **Keep state and behavior cohesive.** Resource implementations own model-facing state; tool implementations own operation contracts and behavior. The host composes their projections through generic discovery interfaces rather than interpreting resource-specific fields. Notifications identify changes, listings expose resource state, and inspection expands available capabilities. Other outputs retain their own purpose instead of becoming alternate discovery channels.
- **History preserves facts.** Record identity, position, and input are fixed. Explicitly pending operations fill their result once; completed records are immutable. Asterism owns its records independently of provider or agent-framework session formats. Detach appends an event. History browsing does not change reality, and restoration requires resource support.
- **Capture the environment at request boundaries.** A request and its tool batch use the captured path, configuration, credentials, and access until completion. Intervening changes take effect in the next request.
- **Local operations follow processing order.** Later backend-processed writes win. Reads return current values at handling time. Pending prevents reentry at the same UI entry; cancellation scopes own asynchronous work. Runtime revisions, generations, precommit rechecks, and hypothetical conflict defenses are not the coordination model. Fixed storage, IPC, and API versions describe software formats.
- **Keep top-level context stable.** Host and plugin top-level tools register statically. Resource changes affect secondary tools and subsequent projection without interrupting one response.
- **Trust plugins and allow failure.** Installed plugins are trusted. Protect identity, authorization contracts, and finalized records. Operations may fail visibly; reduced functionality or convenience is acceptable while those invariants remain intact. Failure does not by itself justify retries, fallback, or additional defensive machinery. Recovery requires a concrete application contract; retries also require a reason another attempt can succeed and safe repeat semantics. Prefer simple control flow and exposed failures over silently masking errors. Avoid speculative quotas and fairness layers.
- **Trust the configured environment.** User-configured local paths, executables, and services are operational inputs, not an additional security boundary. Resolve them according to configuration and platform conventions, perform the requested operation, and expose actual failures. Validation protects explicit input contracts and application-owned invariants. Rely on standard library and operating system guarantees; additional preflight checks, recovery steps, or post-operation verification require an explicit application contract beyond what the underlying operation already provides.
- **Paradigms are plugins.** A concept belongs to the host when its meaning is independent of the Agent paradigm and it has application-wide configuration or state shared by plugins. The host owns its configuration, the SDK owns its domain model and capabilities, and plugins own its usage: resources, tools, views, and model-facing text. Shape capabilities from current real consumers. Agent paradigms own roles, Agent configuration, request assembly, and conversation behavior. The host and SDK import no builtin package; builtin depends on the SDK like any plugin and publishes its paradigm API through `@asterism-app/builtin-api`. Built-in distribution grants no special lifecycle, validation, or host coupling.

## Implementation

Keep application identity, data layout, and internal channel identities centralized. Keep development and installed data separate. Use isolated temporary data for tests and clean up afterward. Keep real sessions, resource snapshots, and credentials out of source control.

Reuse maintained libraries for general controls, animation, layout, drag, and virtualization. Confirm new dependencies separately with rationale and alternatives; official shadcn controls do not count as new dependencies.

- **UI changes:** Consult [the design system](docs/development/design-system.md) for shared presentation, interaction, and copy. Overall visual changes require user confirmation.
- **Registry components:** Follow [vendored UI maintenance](docs/development/vendored-ui.md) when adding or updating a component from a registry.

Use `@asterism-app` for core and framework npm packages, `@asterism-plugins` for official optional plugins, and the author's own scope with an `asterism-` package prefix for third-party plugins. The npm package name is separate from the runtime plugin ID.

## Language

Use English for code identifiers, comments, test descriptions, developer diagnostics, and model-facing harness text. All repository documentation is English, including manuals, engineering documents, source/package README files, plans, and archives.

User-facing application copy remains bilingual, English first. Preserve the original language of user content, quotations, and test data whose language is relevant to the test. Runtime logs use English.

## Model-facing harness text

The harness describes primitives. Host prompts, tool descriptions, and feedback use declarative input/output and infrastructure facts. Users compose workflows. Remove host-authored negative instructions, temporary missing-capability restrictions, and workflow prescriptions when maintaining harness text; preserve user instructions.

A model must be able to understand and call a tool through discovery alone. In the tool contract, explain how to interpret results and reuse outputs as inputs where needed.

Organize tool guidance around purpose and data flow, call shape and result handling, then execution boundaries. Short examples illustrate contracts without prescribing a task workflow. Role instructions and skills carry user-selected responsibilities and procedures.

## Documentation ownership

Creation entries own creation guidance, resources own discovery state, and tools own operation contracts. The interface owns in-context feedback. Manuals explain choices and consequences; engineering docs explain internal design. Role instructions, skills, and task instructions carry user-selected procedures. Verify descriptions of current behavior against the implementation.

**Documentation changes:** Use the [placement and completeness checks](docs/development/README.md#placement-and-completeness-checks) when adding, moving, or deleting explanatory material.

## Plans

Use `todo-<date>-<topic>.md` for deferred work, `ref-<date>-<topic>.md` for research or reference material, and `review-<date>-<topic>.md` for review findings. Use the actual filing date; preserve existing dates when moving records. File tasks only for work deliberately deferred beyond the current session.

Plans may cite reference and review material as working inputs. Archive completed tasks, consumed references, and reviews whose findings have a disposition in `plans/archived/`; archived records stay there. New investigations start new records. Preserve historical evidence and acceptance caveats. Lasting documentation states generalized conclusions without research-basis sections or dependency on those records.

## Validation

Documentation work requires semantic, terminology, language, and standalone-readability checks. Implementation work requires appropriate typechecks and focused unit/contract tests. GUI interaction is accepted by the user; do not automate launch-wait-kill smoke cycles.

UI and style work uses necessary typechecks and builds, not an unrelated full history/runtime suite. Visual configuration and rendering are manually accepted.

Tests target deterministic logic with meaningful branches or calculations: parsing, patches, folding, matching, and formatting. Each case identifies a concrete failure mechanism and an independent expected result. Before adding an assertion, identify the defect a failure would expose; an expectation that only needs updating when a declaration or copy changes adds no behavioral check.

Remove rather than add tests for constants, schemas, type-guaranteed facts, direct forwarding/assembly, implementation-mirroring assertions, UI rendering/interaction, and real or fake timing. Extract meaningful pure UI calculations when appropriate.

Process-backed plugin build/load checks belong to the opt-in integration suite, separate from default unit tests. Run that suite for changes to plugin loading, build resolution, shared SDK/API identity, packaging, or their dependencies; unrelated changes use focused unit tests and the normal build checks.

Cover a contract once at its owning boundary. Repeated downstream tests should reveal an encapsulation gap before adding duplication. Review comments are leads, not automatic requirements; speculative interleavings do not justify defensive mechanisms or tests. Test count and coverage are not goals.

## Decisions and operations

Internal wording, file organization, naming, decomposition, and implementation parameters are autonomous. Product positioning, interaction paradigms, domain semantics, provider/message/tool protocols, storage formats, dependencies, authorization, and external behavior require user decisions. Describe approved design principles in independently readable engineering documents; retain decision rationale as a reference record when useful.

Explain implementation scope and tradeoffs before proceeding; confirmed scope authorizes its routine details. Show the diff or a summary and obtain explicit permission before committing. Commit permission does not include push, release, or other remote writes.

Real data cleanup requires explicit authorization. For persistent-format changes, follow the [migration rules](docs/development/architecture.md#data-preparation).

Main is the trunk; develop and commit directly on main by default. Branches and PRs are optional when useful for collaboration or review. Use Conventional Commits with a lowercase English type; commit subjects and bodies may use any language.

AI-assisted commits include both a `Co-Authored-By` trailer for the model and an `Agent-Harness` trailer for the agent software:

```text
Co-Authored-By: <model-id> <provider-noreply>
Agent-Harness: <harness-name> (<harness-url>)
```

- **Model ID**: Obtain the actual model name from available environment information (for example, `get_agent_state`) and extract the vendor's model ID; ask the user only when it cannot be determined. Drop relay prefixes (such as `provider/`), channel markers (such as `[Kiro]`), and variant suffixes (such as `-thinking` or `-high`), so `[Kiro]claude-opus-5-5-thinking` becomes `claude-opus-5-5`.
- **Provider email**: Always use the model vendor's noreply address regardless of relay or channel: `noreply@anthropic.com` (`claude-*`), `noreply@openai.com` (`gpt-*`, `o1*`, `o3*`, `o4*`, `codex-*`), `noreply@google.com` (`gemini-*`), `noreply@x.ai` (`grok-*`), `noreply@deepseek.com` (`deepseek-*`), `noreply@qwenlm.ai` (`qwen*`), `noreply@zhipuai.cn` (`glm-*`), `noreply@moonshot.cn` (`kimi-*`), or the known vendor's noreply address for other vendors. Only when the model vendor is genuinely unknown, use `noreply@unknown.invalid`; never invent a vendor domain or reuse an unrelated tool domain.
- **Agent harness**: Identify the agent software from available environment information and include its canonical homepage URL in parentheses when known (for example, `Agent-Harness: Asterism (https://asterism.dearain.dev)`). If the harness URL is unknown, omit the parenthesized URL and write only `<harness-name>` rather than guessing.
