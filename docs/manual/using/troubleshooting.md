# Updates and troubleshooting

Use the failure shown by the application or tool to identify the affected connection, plugin, or operation. Saved history, current resource state, and temporary execution feedback are distinct sources of information.

## Model connection failures

Check the selected connection, credentials, model ID, and input capabilities. Run a connection test and inspect its error details.

Provider messages distinguish authentication, model availability, quota, and request compatibility failures. An account quota display is supporting information, not a substitute for the failed request’s response.

After changing settings, start or continue a request so it captures the new configuration.

## Unavailable resource operations

Check whether the resource still exists on the current timeline and is linked to the intended agent. Inspect the operations available for that resource.

For file operations, check the actual file and the directory resource’s root. For network tools, check the configured provider or MCP server. A visible card alone does not prove an operation is available.

## Plugin loading failures

Open the plugin’s management entry for the reported failure. Check the selected package root, declared entries, dependencies, and compatibility with the installed host.

Restart after changing plugin code or enablement. Missing plugin implementations can leave historical data visible through fallback views.

## Startup and data recovery

Startup failures offer diagnostics and access to logs. Data preparation failures offer recovery actions, including retrying, restoring a recovery point, or starting with new data.

Read the confirmation before restoring or resetting. Application recovery points cover application data; external directory contents and service side effects remain outside that recovery.

## Update Asterism

Open **Settings → About** to check the installed version and update status. The update channel controls whether prereleases are included.

An available update downloads before the explicit restart-and-install action. Running resources use the application’s normal exit confirmation. Switching back to the stable channel keeps the installed version until a higher stable version is available.

The About page also opens the log folder. Development runs use separate data and do not install application updates.
