# Workbench-centered SDK proposal

Archived reference from a proposal filed on 2026-10-11, consumed during implementation of the foundation and built-in consumers. Its interface sketches are historical, not current API declarations.

The proposal centered the SDK on sessions, events, and resources. Plugins could manage records or objects without understanding an Agent. Model execution was an optional service branch, and an Agent plugin would own its loop and context projection.

Host services and plugin contributions shared typed declarations. Bound contexts identified the caller and target but did not substitute for runtime ownership and access checks. Current private state did not become restorable history merely because a snapshot could read it.

The proposal favored concrete interfaces and explicit composition over extra declaration layers and a general service registry. Resource creation and actions belonged to the resource contribution. Internal host decomposition did not automatically become public SDK surface.

The intended migration order was event/resource interfaces, one-request model execution, built-in consumers, then management and acceptance. It preserved atomic first input, request-boundary environment, unknown tool effects, and real shutdown completion.

At that point shared instances, cross-plugin communication, package installation/upgrades, and uninstall cleanup remained future work. Author examples were compilation evidence; runtime tests and manual GUI acceptance had separate responsibilities.
