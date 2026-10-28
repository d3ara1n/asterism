# Plugin-declared settings pages

Filed on 2026-10-28. Decision: `plans/ref-2026-10-28-plugin-paradigm-layering.md`.

Plugins declare settings pages that appear on the settings home with source attribution. The plugin category lists installed plugins with information and an enable switch; it no longer hosts per-plugin settings bodies. Most plugins have no settings and need no page.

- [ ] Define the renderer SDK declaration for one or more settings pages per plugin, including title, summary, icon, and addressable locations.
- [ ] Show declared pages on the settings home with their contributing plugin, and keep failure recovery per page.
- [ ] Reduce the plugin category to information and enablement.
- [ ] Move builtin's streaming location to a builtin-declared page. Shell, MCP, and skills become host pages as their services move to the host; until then they use builtin-declared pages.
- [ ] Preserve existing navigation targets such as Home's setup actions.
- [ ] Typecheck and build; the user accepts the visual layout and navigation.

External settings-page acceptance in `plans/todo-2026-10-12-plugin-system.md` applies to the new layout.
