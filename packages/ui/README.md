# Internal shared UI

This package contains controls and presentation helpers shared by the application and built-in plugin.

Shared containers own common layout, focus, and appearance. Business components supply content and behavior through those facilities rather than reproducing styles.

Application state and domain services remain outside this package. It is an internal implementation dependency, not a stable public UI compatibility promise for external plugins.
