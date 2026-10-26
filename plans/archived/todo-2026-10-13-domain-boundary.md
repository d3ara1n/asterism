# Host and executor domain separation

Filed on 2026-10-13. Implementation completed and archived.

The host retained model services, tools, resource links, generic records, and lifecycle. Execution plugins owned their messages, output records, context projection, turn loop, and continuation boundaries.

Historical storage became generic contract/source/payload records. Agent-specific physical node kinds, separate completion storage, and host-side continuation snapping were removed. The Agent alone handled a context ending in an unsuitable block.

The host could select any historical position once relevant work settled. Output completion and usage belonged to domain payloads, and the renderer interpreted those contracts.

Configuration and preferences were separated; built-in interaction settings moved into the plugin domain. Home's built-in Agent composition remained an explicit application responsibility.

Tests, typechecks, and localization checks passed. Development data was not migrated; the user handled its rebuild. Intermediate implementation states were not required to compile.
