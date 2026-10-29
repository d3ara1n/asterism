# Agent paradigm extraction

Filed on 2026-10-28. Decision: `plans/archived/ref-2026-10-28-plugin-paradigm-layering.md`. Depends on plugin-declared settings pages; builtin entry validation integrates with the single assembly entry in `plans/archived/todo-2026-10-28-agent-skills-instructions.md`.

The host stops knowing the builtin Agent paradigm. Builtin is an ordinary bundled plugin and owns roles, Agent configurations, and its Home entry interface. The host supplies concrete model access, session and resource operations, and the Home container. A session is the user's work history and workbench, independently of any Agent representation.

- [x] Change SDK model operations to a provider, model, and thinking target; remove role-based targets and `ModelServices.roles()`. A missing model fails explicitly.
- [x] Replace SDK prompt block kinds with paradigm-neutral source and text; builtin defines its own structured blocks and request measurements.
- [x] Move roles, Agent configurations, defaults, and their settings pages into builtin and builtin-declared settings pages.
- [x] Add SDK registration for plugin-provided Home entry interfaces and host arbitration: one entry is displayed directly, several are chosen in General settings, a removed selection prompts a new choice, and no entry reports that an Agent paradigm plugin is required while templates remain accessible.
- [x] Move the Home conversation composer, draft handling, Agent/model choices, and business validation into builtin's entry. Remove the host's fixed first-message contract and builtin prompt preflight. Builtin request validation uses its single request assembly entry.
- [x] Expose generic session creation and resource assembly operations needed by the entry. The plugin can use backend operations to prepare and assemble the session and supplies its initial title; the host retains contract validation and authorization.
- [x] Keep session titles and user title changes in the host. Keep automatic naming, the Agent-turn trigger, and utility role resolution in builtin; remove host calls to builtin naming interfaces and host interpretation of builtin naming records. Preserve explicit-title protection within builtin's automatic naming behavior.
- [x] Keep templates as host-owned static session/resource composition, instantiated through resource declarations independently of the selected Home entry.
- [x] Remove production host and SDK imports of builtin packages. Test fixtures may explicitly load the paradigm they exercise.
- [x] Verify that builtin uses ordinary plugin loading and enablement and that a replacement entry can start work without a conversation message or a builtin Agent resource.
- [x] Update model configuration, plugin SDK, and manual documentation to the implemented behavior, and verify it against the architecture, object model, workbench, and session naming requirements.

Previous distributed versions were test builds. Compatibility adapters and migrations are outside this restructuring; implement the final contracts directly. Real data cleanup is not authorized by this plan.

## Disposition

Implementation is complete. Typechecks, production build, translation checks, and 153 test files containing 927 tests passed. An isolated package run compiled and initialized builtin, read its public API manuals, disabled it, loaded the actual Counter example package, and created a Counter workspace without an Agent or message. Session tests cover atomic initialization, accepted retry identity, attachments, action preparers, and title restoration.

Home and settings visual/navigation acceptance remains manual and has not been performed. Installed application packaging and native terminal interaction have not been exercised. Real development and installed data were not modified.
