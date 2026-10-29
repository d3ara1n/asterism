# Plugin-declared settings pages

Filed on 2026-10-28. Decision: `plans/archived/ref-2026-10-28-plugin-paradigm-layering.md`.

Plugins declare configuration-page entries on the settings home with source attribution. For example, Roles is marked as contributed by builtin and opens builtin's configuration interface. A normal Plugins card opens a plain management list; plugin cards do not serve as configuration-page entry points. Most plugins have no settings and need no configuration page.

- [x] Define the renderer SDK declaration for one or more settings pages per plugin, including title, summary, icon, and addressable locations.
- [x] Show declared pages on the settings home with their contributing plugin, and keep failure recovery per page.
- [x] Remove the plugin list beneath the settings home and plugin-card navigation to configuration pages.
- [x] Add a normal Plugins card on the settings home, opening a plain list for plugin information and enablement.
- [x] Move builtin's streaming location to a builtin-declared page. Shell, MCP, and skills are host pages.
- [x] Route setup actions to the appropriate declared page; builtin's Home entry owns its paradigm-specific setup actions. Old navigation identifiers require no compatibility aliases.
- [x] Typecheck and production build.
- [ ] User acceptance of the visual layout and navigation remains outstanding.

External settings-page acceptance in `plans/todo-2026-10-12-plugin-system.md` applies to the new layout.

Implementation is archived as complete. Renderer registration tests and translation checks pass. This record does not claim manual UI acceptance.
