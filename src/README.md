# Application implementation

The desktop application separates platform integration, backend execution, and interface presentation.

Main owns windows, system capabilities, credentials, process supervision, and shutdown. Preload exposes restricted desktop capabilities. The independent runtime owns business services and persistence, so work survives page navigation.

The renderer expresses user intent and presents current state. Business traffic uses a direct runtime connection; the main process retains desktop and supervision responsibilities.

Generic host mechanisms implement transactions, identity, routing, and lifecycle. Plugins own domain behavior and consume host services through the SDK. Application composition assembles shared services, while plugin adapters bind them to each consumer's identity and lifetime.

Keep changes at their responsible boundary. A public extension interface should describe a real consumer need rather than every internal implementation helper.

## Directory map

| Directory | Responsibility |
| --- | --- |
| `main/` | Desktop integration and process supervision |
| `preload/` | Restricted desktop bridge |
| `runtime/` | Backend application composition and transport |
| `session/` | Historical records and current workbench state |
| `storage/` | Persistent format preparation and recovery |
| `configuration/` | Global settings and provider selection |
| `model/` and `execution/` | Protocol adaptation and request/tool execution |
| `shell/` | Shared shell profiles, command execution, and interactive terminal sessions |
| `resources/` and `tools/` | Resource identity, capabilities, and dispatch |
| `plugins/` | Package loading, contribution assembly, and plugin lifecycle |
| `plugins/sdk/` | Plugin-facing adapters for shared services and object operations |
| `renderer/` | Application interaction and presentation |
| `shared/` | Cross-layer data and deterministic shared logic |
