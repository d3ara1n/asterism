# Cross-platform behavior audit

Filed on 2026-10-23.

macOS is the primary development platform, while delivery targets also include Windows and Linux. This task covers platform differences in processes, paths, shells, windows, credentials, and packaging.

## Disposition

The user confirmed cross-platform behavior acceptance on 2026-10-31. This plan is complete and archived. The confirmation covers the platform scope below; exact build versions and machine details were not supplied. This is user acceptance, not a new automated test run.

## Investigation context

Initial investigation targets included Windows wrapper commands launched without a shell, login-environment completeness, and process-tree cleanup on Windows.

## Accepted platform scope

- [x] Review process groups, descendant termination, PTY cleanup, and MCP stdio launch/reclamation.
- [x] Review executable lookup, PATHEXT, environment-name casing, shell defaults, and integration scripts.
- [x] Review real paths, home expansion, drive letters, separators, case-insensitive filesystems, and plugin asset paths.
- [x] Verify native materials, titlebar controls, and fallback behavior.
- [x] Verify secure credential availability on Windows and Linux keyring backends.
- [x] Verify native modules/helpers outside asar and their executable permissions on each target.

Future platform changes should document confirmed principles and test meaningful deterministic parsing logic where applicable. No additional implementation or test changes are claimed by this acceptance record.

No compatibility branches are required merely to preserve abandoned development behavior. Real-machine GUI/process acceptance remains separate from static checks.
