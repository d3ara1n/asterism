# Asterism project conventions

Asterism is an object-centered, plugin-based personal agent workbench for organizing work, resources, and execution history. Agent paradigms are plugin features; the bundled builtin plugin is the official paradigm.

## Engineering principles

- **Authorization is a context boundary.** Explicit resource identity and runtime authorization determine the objects visible and usable in a request. Storage directories, cards, links as visual elements, and tool catalog visibility are not implicit access grants or an operating system sandbox. Asterism has no general permission model or agent behavior audit. Shells, terminals, and MCP run as the current user.
- **Resources and tools are peers.** Tool implementations declare supported resources. Links activate matching capabilities; agent policy independently filters them. Resource definitions contain neither tools nor tool policy.
- **History is immutable.** Asterism owns its records independently of provider or agent-framework session formats. Detach appends an event. History browsing does not change reality, and restoration requires resource support.
- **Capture the environment at request boundaries.** A request and its tool batch use the captured path, configuration, credentials, and access until completion. Intervening changes take effect in the next request.
- **Local operations follow processing order.** Later backend-processed writes win. Reads return current values at handling time. Pending prevents reentry at the same UI entry; cancellation scopes own asynchronous work. Runtime revisions, generations, precommit rechecks, and hypothetical conflict defenses are not the coordination model. Fixed storage, IPC, and API versions describe software formats.
- **The harness describes primitives.** Host prompts, tool descriptions, and feedback use declarative input/output and infrastructure facts. Users compose workflows. Remove host-authored negative instructions, temporary missing-capability restrictions, and workflow prescriptions when maintaining harness text; preserve user instructions.
- **Keep top-level context stable.** Host and plugin top-level tools register statically. Resource changes affect secondary tools and subsequent projection without interrupting one response.
- **Trust plugins and expose failures.** Installed plugins are trusted. Protect identity, authorization contracts, and immutable history; avoid speculative quotas, fairness layers, and silent fallback.
- **Trust the configured environment.** User-configured local paths, executables, and services are operational inputs, not an additional security boundary. Resolve them according to configuration and platform conventions, perform the requested operation, and expose actual failures. Validation protects explicit input contracts and application-owned invariants. Rely on standard library and operating system guarantees; additional preflight checks, recovery steps, or post-operation verification require an explicit application contract beyond what the underlying operation already provides.
- **Paradigms are plugins.** A concept belongs to the host when its meaning is independent of the Agent paradigm and it has application-wide configuration or state shared by plugins. The host owns its configuration, the SDK owns its domain model and capabilities, and plugins own its usage: resources, tools, views, and model-facing text. Shape capabilities from current real consumers. Agent paradigms own roles, Agent configuration, request assembly, and conversation behavior. The host and SDK import no builtin package; builtin depends on the SDK like any plugin and publishes its paradigm API through `@asterism-app/builtin-api`. Built-in distribution grants no special lifecycle, validation, or host coupling.

## Environment and implementation

Development starts with `npm run dev`. The stack is Electron, React, TypeScript, shadcn/Radix, Tailwind, React Flow, SQLite, Zod, an independent task runtime, and AI SDK adaptation. Installed versions belong to the lockfile. macOS is the main test platform; releases target macOS, Windows, and Linux.

Keep fixed application identity, data layout, and internal channel identities centralized. Development and installed data are separate. Tests use isolated temporary data and clean up. Real sessions, resource snapshots, and credentials stay outside source control. The one-off prototype remains on `feat/ux-prototype`; production code does not depend on it.

Current example resources validate foundations and do not define the final product catalog. Workbench cards and auxiliary surfaces reuse the shared object and island presentation. Overall visual changes require user confirmation.

Reuse maintained libraries for general controls, animation, layout, drag, and virtualization. Confirm new dependencies separately with rationale and alternatives. For a missing shadcn control, check the registry and use `npx shadcn@latest add <name>`; official controls do not count as new dependencies. Verify relative imports and remove accidental CLI additions.

## Language

Use English for code identifiers, comments, test descriptions, developer diagnostics, and model-facing harness text. All repository documentation is English, including manuals, engineering documents, source/package README files, plans, and archives.

User-facing application copy remains bilingual, English first. Preserve the original language of user content, quotations, and test data whose language is relevant to the test. Runtime logs use English.

## Documentation ownership

The collections have distinct writing requirements:

- `docs/manual/`: concise guides for models helping users use Asterism or develop plugins. Explain purpose, concepts, and working methods. No localized editions or public documentation site.
- `docs/development/`: internal software engineering principles, responsibility boundaries, and design constraints. These are not plugin-author or software-use guides.
- `plans/`: deferred tasks (`todo`), research and reference material (`ref`), and review findings (`review`), archived when their work or use ends.

Manual and engineering pages are independently readable. Include enough context to explain each topic. Stable directory maps may describe organization and responsibilities. Keep these pages free of cross-document references, research-source trails, per-file source indexes, and API inventories. Models can search files and integrate information themselves.

Prefer stable meaning over implementation detail. A code move, parameter change, or edit to another document should not require updates here. Update a page when the concept or design it explains changes. Verify claims while writing; do not silently promote a proposal or old acceptance record into current behavior.

## Plans

Use `todo-<date>-<topic>.md` for deferred work, `ref-<date>-<topic>.md` for research or reference material, and `review-<date>-<topic>.md` for review findings. Use the actual filing date; preserve existing dates when moving records. File tasks only for work deliberately deferred beyond the current session.

Plans may cite reference and review material as working inputs. Archive completed tasks, consumed references, and reviews whose findings have a disposition in `plans/archived/`; archived records stay there. New investigations start new records. Preserve historical evidence and acceptance caveats. Lasting documentation states generalized conclusions without research-basis sections or dependency on those records.

## Validation

Documentation work requires semantic, terminology, language, and standalone-readability checks. Implementation work requires appropriate typechecks and focused unit/contract tests. GUI interaction is accepted by the user; do not automate launch-wait-kill smoke cycles.

UI and style work uses necessary typechecks and builds, not an unrelated full history/runtime suite. Visual configuration and rendering are manually accepted.

Tests target deterministic logic with meaningful branches or calculations: parsing, patches, folding, matching, and formatting. Each case identifies a concrete failure mechanism and an independent expected result.

Remove rather than add tests for constants, schemas, type-guaranteed facts, direct forwarding/assembly, implementation-mirroring assertions, UI rendering/interaction, real processes, and real or fake timing. Extract meaningful pure UI calculations when appropriate.

Cover a contract once at its owning boundary. Repeated downstream tests should reveal an encapsulation gap before adding duplication. Review comments are leads, not automatic requirements; speculative interleavings do not justify defensive mechanisms or tests. Test count and coverage are not goals.

## Decisions and operations

Internal wording, file organization, naming, decomposition, and implementation parameters are autonomous. Product positioning, interaction paradigms, domain semantics, provider/message/tool protocols, storage formats, dependencies, authorization, and external behavior require user decisions. Describe approved design principles in independently readable engineering documents; retain decision rationale as a reference record when useful.

Explain implementation scope and tradeoffs before proceeding; confirmed scope authorizes its routine details. Show the diff or a summary and obtain explicit permission before committing. Commit permission does not include push, release, or other remote writes.

Before user distribution, incompatible development formats can be rebuilt without migration, with explicit authorization for real data cleanup. Internal test releases do not establish compatibility. First user distribution, including friend-facing prereleases, requires continuous n-to-n+1 migrations and old-format fixtures thereafter.

Main is the trunk; develop and commit directly on main by default. Branches and PRs are optional when useful for collaboration or review. Use Conventional Commits with a lowercase English type; commit subjects and bodies may use any language. AI-assisted commits include a Co-Authored-By trailer using the actual model identity from PI_* and its provider noreply address, or noreply@pi.dev when unknown. Read PI_MODEL before each commit rather than reusing an earlier trailer, and keep only the provider's model ID: drop channel markers such as `[Kiro]` and variant suffixes such as `-thinking`, so `[Kiro]claude-opus-5-5-thinking` becomes `claude-opus-5-5`.
