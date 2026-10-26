# Application shell and settings

Filed on 2026-10-01. The basic shell and settings entry were implemented. The archived record retained outstanding interaction checks.

The shell established native-window surfaces, separate main/settings screens, island layout, shared controls, sidebar navigation, and expandable settings categories. Real provider, role, and Agent configuration was integrated while some general settings still represented previews.

The design separated an unimplemented capability from missing user configuration. Settings remained accessible without a session. Navigation and view layout were independent of business history.

Typechecks and builds passed. The remaining checklist covered keyboard navigation, focus return, scrolling, narrow windows, window dragging, close/reopen behavior, coordination with object/history panels, and returning to the previous main view without losing saved state.

Final completion required concrete fixes or separately filed follow-up, not treating the shell scaffold as full acceptance.

Automatic layout, full dark themes, multi-agent work, MCP, and state restoration were outside the shell task.
