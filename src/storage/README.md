# Application storage

The host owns the application data root and its fixed layout. Development and installed builds use separate roots beneath Electron's application-data directory; installed update channels share a root. Display-name changes do not rename application data.

## Layout and ownership

| Location beneath the data root | Responsibility |
| --- | --- |
| `configuration.json` | Host configuration, including provider connections, models, shell profiles, MCP servers, the Home selection, and MCP OAuth state |
| `appearance.json`, `language.json`, `network.json`, `updates.json` | Main-process preferences |
| `plugins.json` | Plugin package loading list |
| `db/` | Runtime workspace database |
| `content/sealed/` | Immutable content referenced by workspace data and history |
| `extensions/<pluginId>/` | Plugin-private persistent files; host-managed configuration, secrets, and database facilities use its `.asterism/` subdirectory |
| `credentials/` | Legacy encrypted credentials retained for migration and recovery |
| `plugins/` | Plugin package resolution workspace, with generated startup artifacts beneath `.cache/`; this is not plugin-private data |
| `content/temporary/` | In-progress content uploads, cleared during startup collection |
| `ui-state.json` | Reconstructible main-process UI state |
| `shell-integration/` | Generated shell integration files |
| `chromium/` | Electron session data |
| `logs/` | Runtime diagnostics |
| `recovery/` | Recovery points and recovery-operation state |

Host layout names are centralized in the application identity definition. Plugin-declared paths remain relative to the owning plugin's data directory. Plugins own their payload schemas and migrations; the host does not interpret paradigm-specific settings.

Configuration and authorization state have different lifecycles even where they share a file. Host connection credentials and MCP OAuth state are saved in configuration; plugin secrets are saved in plugin storage. Values may be literal credentials or credential-command expressions. Configuration files and recovery points can therefore contain sensitive data and are not sanitized exports. The legacy credentials directory is not the destination for new credentials.

## System temporary files

Asterism-owned system temporary files share an `asterism/` directory beneath the operating system’s temporary directory (`asterism-<uid>/` on Linux). Development uses its `dev/` subtree. The plugin runtime SDK exposes the plugin-ID subdirectory as `plugin.tempDir`; the plugin creates it as needed and treats its contents as disposable. Host shell output spills belong to `host/shell/`. These files are outside recovery points and may be removed by the operating system. Content upload staging and atomic replacement files stay on the destination filesystem so they can be renamed into place.

## Preparation and recovery

Prepare persistent formats before starting business services. Preparation decides from format versions; business readers own payload validation. Missing files remain absent until their owner creates them.

Migrations form an explicit consecutive chain and commit atomically within each storage boundary. Published transformations retain their historical paths and semantics rather than following changes to the current layout or business helpers.

Recovery covers the workspace database directory, global configuration, plugin package list, main-process preference files, legacy credentials, plugin-private data directories, and sealed content. Immutable sealed bytes can be shared through hard links, with copies where hard links are unsupported.

Generated plugin artifacts, temporary content, UI state, shell integration files, Chromium data, and logs are outside that recovery group. Recovery points do not contain other recovery points. External resource files, local plugin source packages, installed package code, and service effects are outside application-data restoration.

Recovery membership and format registration are separate. A recovery directory can cover several formats and undeclared files. Versioned formats can also share a file, as workspace structure and plugin record groups do, without needing separate recovery entries.

Plugin preparation is independent of normal runtime setup. A plugin data failure can prevent that plugin from loading without preventing unrelated application use.

## Adding persistent storage

For a new host-owned store, define its fixed layout name, assign its read/write owner, and decide whether it is persistent user data or reconstructible state. Include persistent data in the application recovery group and register versioned formats for preparation. A store already covered by a parent recovery directory needs no separate recovery entry.

Use the plugin's directory for private files and the workspace database for session records. Declare versioned formats for either through the plugin storage entry. Both locations are already covered by recovery. Credentials follow their owning connection or plugin rather than a new central secrets directory.

Changes to physical layout or saved formats require an explicit storage decision and the applicable migration or authorized development-data cleanup. Internal path-reference cleanup alone does not change versions or move data.
