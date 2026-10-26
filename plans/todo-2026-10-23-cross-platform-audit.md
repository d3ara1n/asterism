# Cross-platform behavior audit

Filed on 2026-10-23.

macOS is the primary development platform, while delivery targets also include Windows and Linux. This task investigates actual platform differences in processes, paths, shells, windows, credentials, and packaging.

## Known investigation targets

Windows wrapper commands such as batch-file launchers need explicit handling when a process is spawned without a shell. Login-environment completeness needs verification. Process-tree cleanup strategies also need comparison on real Windows systems.

## Remaining work

- [ ] Review process groups, descendant termination, PTY cleanup, and MCP stdio launch/reclamation.
- [ ] Review executable lookup, PATHEXT, environment-name casing, shell defaults, and integration scripts.
- [ ] Review real paths, home expansion, drive letters, separators, case-insensitive filesystems, and plugin asset paths.
- [ ] Verify native materials, titlebar controls, and fallback behavior.
- [ ] Verify secure credential availability on Windows and Linux keyring backends.
- [ ] Verify native modules/helpers outside asar and their executable permissions on each target.
- [ ] Record confirmed platform principles and test meaningful deterministic parsing logic.

No compatibility branches are required merely to preserve abandoned development behavior. Real-machine GUI/process acceptance remains separate from static checks.
