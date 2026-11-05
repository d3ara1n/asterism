# Shared UI

This package contains controls and presentation helpers shared by the application and plugins.

Shared containers own common layout, focus, and appearance. Business components supply content and behavior through those facilities rather than reproducing styles.

The subpaths in `package.json` `exports` form the plugin-facing surface. At runtime, plugin bundles resolve these imports to the host's instances, so every plugin shares one copy of each control, its providers, and its styles. Files outside those exports are implementation details.

Markdown is one of these controls. It renders history and live output with the same component. During generation and a short drain window after it, streaming output animates; then the component switches to static rendering. It also covers code with copyable source, math, Mermaid diagrams, document-local footnotes, and skill, resource, and web links. Typography and KaTeX styles come from the host stylesheet.

Application state and domain services remain outside this package.
