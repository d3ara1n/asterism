# Built-in plugin

The built-in plugin implements Agent conversations and the resource capabilities distributed with Asterism. It uses the same host mechanisms as external plugins.

Domain modules own their data, execution policy, and views. Shared plugin services have plugin lifetime; object-owned processes and connections have resource lifetime.

Application composition supplies the application-specific capabilities the plugin needs. Distribution with the application does not grant an exemption from identity, validation, or lifecycle rules.

Keep backend work independent of card mounting. Views can disappear or move while resources continue running.

## Capability directories

| Directory under `src/` | Responsibility |
| --- | --- |
| `agent/` | Agent execution and conversation |
| `questions/` | Structured user interaction |
| `notes/` and `filesystem/` | Working text and local files |
| `shell/` and `terminal/` | Commands and interactive processes |
| `resources/` | Model-facing resource operations |
| `naming/` | Session title behavior |
| `skills/` | Skill discovery and reading |
| `providers/` and `usage/` | Provider contributions and usage consumption |
| `web/` and `mcp/` | Network and external-tool capabilities |
| `settings/` | Built-in preferences |
| `shared/`, `messages/`, and `locales/` | Shared behavior and interface text |
