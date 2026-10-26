# Application interface

The renderer presents application navigation, workbench objects, and plugin views. It uses controlled desktop and runtime capabilities rather than general Node access.

View subscriptions follow visibility. User-created drafts and view choices can follow object presence when they must survive remounts. Backend execution has its own lifetime.

Read errors belong to the view reader. An operation's pending state and failure belong to its entry. Ordered current-state updates do not require repeatedly reloading the entire history.

Shared containers own layout and focus. Domain views own their content. Language and theme changes update presentation without replacing business identity.
