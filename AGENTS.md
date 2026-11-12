# Asterism project conventions

Asterism is an object-centered, plugin-based personal agent workbench for organizing work, resources, and execution history. Agent paradigms are plugin features; the bundled builtin plugin is the official paradigm.

## Engineering principles

- **Authorization is a context boundary.** Explicit resource identity and runtime authorization determine the objects visible and usable in a request. Storage directories, cards, links as visual elements, and tool catalog visibility are not implicit access grants or an operating system sandbox. Asterism has no general permission model or agent behavior audit. Shells, terminals, and MCP run as the current user.
- **Resources and tools are peers.** Tool implementations declare supported resources. Links activate matching capabilities; execution policy independently filters them. Resource definitions contain neither tools nor tool policy.
- **Keep state and behavior cohesive.** Resource implementations own model-facing state; tool implementations own operation contracts and behavior. The host composes their projections through generic discovery interfaces rather than interpreting resource-specific fields. Notifications identify changes, listings expose resource state, and inspection expands available capabilities. Other outputs retain their own purpose instead of becoming alternate discovery channels.
- **History preserves facts.** Record identity, position, and input are fixed. Explicitly pending operations fill their result once; completed records are immutable. Asterism owns its records independently of provider or agent-framework session formats. Detach appends an event. History browsing does not change reality, and restoration requires resource support.
- **Capture the environment at request boundaries.** A request and its tool batch use the captured path, configuration, credentials, and access until completion. Intervening changes take effect in the next request.
- **Local operations follow processing order.** Later backend-processed writes win. Reads return current values at handling time. Pending prevents reentry at the same UI entry; cancellation scopes own asynchronous work. Runtime revisions, generations, precommit rechecks, and hypothetical conflict defenses are not the coordination model. Fixed storage, IPC, and API versions describe software formats.
- **Keep top-level context stable.** Host and plugin top-level tools register statically. Resource changes affect secondary tools and subsequent projection without interrupting one response.
- **Trust plugins and allow failure.** Installed plugins are trusted. Protect identity, authorization contracts, and finalized records. Operations may fail visibly; reduced functionality or convenience is acceptable while those invariants remain intact. Failure does not by itself justify retries, fallback, or additional defensive machinery. Recovery requires a concrete application contract; retries also require a reason another attempt can succeed and safe repeat semantics. Prefer simple control flow and exposed failures over silently masking errors. Avoid speculative quotas and fairness layers.
- **Trust the configured environment.** User-configured local paths, executables, and services are operational inputs, not an additional security boundary. Resolve them according to configuration and platform conventions, perform the requested operation, and expose actual failures. Validation protects explicit input contracts and application-owned invariants. Rely on standard library and operating system guarantees; additional preflight checks, recovery steps, or post-operation verification require an explicit application contract beyond what the underlying operation already provides.
- **Paradigms are plugins.** A concept belongs to the host when its meaning is independent of the Agent paradigm and it has application-wide configuration or state shared by plugins. The host owns its configuration, the SDK owns its domain model and capabilities, and plugins own its usage: resources, tools, views, and model-facing text. Shape capabilities from current real consumers. Agent paradigms own roles, Agent configuration, request assembly, and conversation behavior. The host and SDK import no builtin package; builtin depends on the SDK like any plugin and publishes its paradigm API through `@asterism-app/builtin-api`. Built-in distribution grants no special lifecycle, validation, or host coupling.

## Environment and implementation

Development starts with `npm run dev`. The stack is Electron, React, TypeScript, shadcn/Radix, Tailwind, React Flow, SQLite, Zod, an independent task runtime, and AI SDK adaptation. Installed versions belong to the lockfile. macOS is the main test platform; releases target macOS, Windows, and Linux.

Keep fixed application identity, data layout, and internal channel identities centralized. Development and installed data are separate. Tests use isolated temporary data and clean up. Real sessions, resource snapshots, and credentials stay outside source control. The one-off prototype remains on `feat/ux-prototype`; production code does not depend on it.

Current example resources validate foundations and do not define the final product catalog. Workbench cards and auxiliary surfaces reuse the shared object and island presentation. Overall visual changes require user confirmation.

Interface copy states only what visuals cannot. Encode state with bars, rings, icons, tones, and labeled values rather than explanatory sentences. Omit text that restates the domain's inherent semantics, describes implementation, or reassures the user; mark exceptional states with a short label. Explanations for developers belong in code comments.

Reuse maintained libraries for general controls, animation, layout, drag, and virtualization. Confirm new dependencies separately with rationale and alternatives. For a missing shadcn control, check the registry and use `npx shadcn@latest add <name>`; official controls do not count as new dependencies.

### Vendored shadcn components

`packages/ui/src/ui/` mixes shadcn registry files with project-owned controls. Run the shadcn CLI from the repository root: the `packages/ui` config cannot resolve its aliases, and the root config rewrites the `cn` import to an npm package named `cn` and adds it as a dependency. After every `add` or `--overwrite` of a registry file, restore relative imports (`../utils`, `./button`), drop the `cn` dependency, and reapply the local changes below. Keep this list current whenever a registry file gains or loses a local change.

- `input-group`: `InputGroupAddon` click focuses `[data-slot=input-group-control]` instead of the first `input`, so textareas receive focus and hidden file inputs are skipped.
- `button`, `badge`: `destructive` uses `text-destructive-foreground` without dark overrides, `link` uses `text-primary-text`; button adds the `selected` variant, badge adds `success` and `warning`.
- `empty`, `field`, `item`: link hover uses `text-primary-text`.
- `dialog`, `command`, `spinner`: built-in labels come from `useI18n()` and `commonMessages`; `DialogContent` accepts `closeLabel`, and `CommandDialog` title and description default to localized messages.
- `progress`: forwards `value` to the Radix root so the value attributes are exposed.
- `message-scroller`: the jump button's screen-reader label comes from `commonMessages`; the viewport drops the undefined `scroll-fade-b` utility and keeps scrollbar visibility independent of autoscrolling.

## Language

Use English for code identifiers, comments, test descriptions, developer diagnostics, and model-facing harness text. All repository documentation is English, including manuals, engineering documents, source/package README files, plans, and archives.

User-facing application copy remains bilingual, English first. Preserve the original language of user content, quotations, and test data whose language is relevant to the test. Runtime logs use English.

## Model-facing harness text

The harness describes primitives. Host prompts, tool descriptions, and feedback use declarative input/output and infrastructure facts. Users compose workflows. Remove host-authored negative instructions, temporary missing-capability restrictions, and workflow prescriptions when maintaining harness text; preserve user instructions.

Runtime tool guidance belongs in the owning tool's description, guidelines, and input/output schemas, available through tool discovery. A model must be able to understand and call a tool without reading the manual. Explain relationships between outputs and later inputs where needed, rather than relying on field names or external guides.

Organize tool guidance around purpose and data flow, call shape and result handling, then execution boundaries. Short examples illustrate contracts without prescribing a task workflow. Role instructions and skills carry user-selected responsibilities and procedures.

## Documentation ownership

Choose a primary home by the question the information answers. A primary home owns the complete facts; another surface can explain their consequences for its audience without becoming a parallel reference.

| Information or question | Primary home |
| --- | --- |
| What resource can I create, what is it for, and what must I know before creating it? | Creation entry description, guidelines, and input schema |
| What is this linked resource's current state? | Resource-owned discovery and inspection state |
| How do I perform an operation, interpret its result, and understand its execution boundaries? | Owning tool description, guidelines, and input/output schemas |
| What should the interface communicate at this point of use? | User-facing controls, labels, and contextual feedback |
| When should I choose a resource, how should I relate it to other resources, and what tradeoffs matter? | Resource sections in the user manual |
| Why does a resource behave this way, what should a user expect, and which caveats affect their work? | Resource sections in the user manual, grounded in current behavior |
| How should a plugin author choose integration boundaries and use the public model? | Plugin-author manual and public-package guides; types and executable examples own concrete interfaces |
| Which internal engineering principles and responsibility boundaries should implementation preserve? | `docs/development/`; local implementation rationale belongs in code comments |
| What responsibilities, procedures, and completion criteria has the user selected? | Role instructions, skills, and task instructions |
| What work is deferred, what was investigated, or what did a review find? | `plans/` tasks (`todo`), references (`ref`), and reviews (`review`) |

### Manual scope

`docs/manual/` serves users understanding and using Asterism and authors designing plugins, including public-package guides exposed through the Manual resource. Explain mental models, usage philosophy, design choices, and working principles. Models consult relevant topics on demand for those tasks; ordinary tool use is self-contained through discovery. There are no localized editions or public documentation site. Internal engineering documents serve maintainers, not plugin authors or application users.

The user manual includes sections for individual resource types; related resources can share a chapter. Keep application resource topics in `docs/manual/using/resources/`, grouped by shared usage questions rather than by individual tools. Each section explains the resource's role in the work, when to choose it, meaningful relationships with other participants or material, and tradeoffs or common conceptual mistakes. Include user-relevant behavior, lifecycle caveats, and consequences that help explain an observed result or set expectations. These explanations are available on demand; they need not become always-loaded model instructions. Briefly identify the resource so the section stands alone, then contribute understanding beyond its creation description, inspection state, and tool contracts. Resource coverage is not a feature catalog or a reason to manufacture filler.

Tool catalogs, introductions to individual tools, invocation recipes, parameter/output inventories, execution-environment references, control-by-control walkthroughs, and lists of defaults and limits belong in their owning contracts or interfaces. The manual can restate enough verified behavior to explain a caveat or answer why something happened; functional detail serves that explanation rather than cataloging operations. A manual example can illustrate a choice or relationship without reproducing an invocation sequence. Plugin guides explain integration choices and responsibility boundaries rather than maintaining a prose copy of public APIs.

Manual and engineering pages are independently readable. Include enough context to explain each topic. Stable directory maps may describe organization and responsibilities. Keep these pages free of cross-document references, research-source trails, per-file source indexes, and API inventories. Models can search files and integrate information themselves.

### Placement and completeness checks

When adding, moving, or deleting explanatory content:

1. **Classify the claim.** Separate current state, an executable contract, user-selected procedure, and conceptual guidance. Mixed paragraphs can need different homes. For example, a schedule operation's activation requirements belong in its tool contract; explaining how session sleep affects reminders also belongs in the manual as a user-facing caveat. Facts needed to use a tool correctly remain discoverable through its contract even when the manual explains their consequences.
2. **Check the owner.** Read the current implementation and the relevant creation, resource, and tool projections. Verify what a reader can actually discover; neither missing manual prose nor the existence of a schema establishes a gap or adequate coverage. A model must be able to understand and call a tool without consulting the manual.
3. **Keep the distinct contribution.** Ask what choice, expectation, or observed behavior the prose helps a reader understand beyond a bare statement of discoverable facts. Retain that explanation in the manual; place missing operational facts in the owning contract. Existing contract coverage does not by itself make a user-facing explanation redundant. A code move, parameter change, or new control alone should not require a manual update; a change in the underlying concept or design can.
4. **Account for removals.** Identify whether removed material is redundant, obsolete, or still needed elsewhere. Before deleting unique, necessary guidance, preserve it at the appropriate home and verify that it is discoverable there. Review both duplication and omissions, including per-resource conceptual coverage; neither shorter prose nor one chapter per resource proves completeness.

Verify claims while writing rather than promoting proposals or old acceptance records into current behavior. Source code, types, schemas, configuration, and executable examples own current interfaces and behavior; documentation adds intent, rationale, mental models, and principles for making choices.

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

Before user distribution, incompatible development formats can be rebuilt without migration, with explicit authorization for real data cleanup. Internal test releases do not establish compatibility. First user distribution, including friend-facing prereleases, requires continuous n-to-n+1 migrations and old-format fixtures thereafter.

Main is the trunk; develop and commit directly on main by default. Branches and PRs are optional when useful for collaboration or review. Use Conventional Commits with a lowercase English type; commit subjects and bodies may use any language. AI-assisted commits include a Co-Authored-By trailer using the actual model ID and its provider noreply address; use noreply@pi.dev only when the provider address is unknown. Obtain the actual model name from the available environment information and extract the provider's model ID; ask the user only when it cannot be determined. Keep only the provider's model ID: drop channel markers such as `[Kiro]` and variant suffixes such as `-thinking`, so `[Kiro]claude-opus-5-5-thinking` becomes `claude-opus-5-5`.
