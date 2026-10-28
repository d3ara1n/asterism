# Agent paradigm extraction

Filed on 2026-10-28. Decision: `plans/ref-2026-10-28-plugin-paradigm-layering.md`. Depends on plugin-declared settings pages.

The host stops knowing the builtin Agent paradigm. Builtin owns roles and Agent configurations; the host supplies concrete model access and the session entry point.

- [ ] Change SDK model operations to a provider, model, and thinking target; remove role-based targets and `ModelServices.roles()`. A missing model fails explicitly.
- [ ] Replace SDK prompt block kinds with paradigm-neutral source and text; builtin defines its own structured blocks and request measurements.
- [ ] Move roles, Agent configurations, defaults, and their settings pages into builtin and builtin-declared settings pages.
- [ ] Add SDK session entry handler registration and host arbitration as specified in the decision: one handler is used directly, several are chosen in General settings, a removed selection prompts a new choice, and no handler reports that an Agent paradigm plugin is required.
- [ ] Move first-input preflight into builtin's handler on the single assembly entry, or remove it.
- [ ] Remove all host imports of builtin packages.
- [ ] Resolve the open Home composer controls question with the user before changing Home's Agent and model choices.
- [ ] Update architecture, model configuration, plugin SDK, and manual documentation to the implemented behavior.

Storage formats can be rebuilt without migration while no build has been distributed beyond the maintainer. Real development data cleanup still requires explicit authorization.

Typechecks and focused tests cover target resolution, configuration ownership, and the missing-handler path. Home and settings changes are accepted by the user.
