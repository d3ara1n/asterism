# Plugin discovery and online distribution

Investigated on 2026-11-19. This is a product recommendation, not an approved scope or evidence of GUI acceptance.

## Current Asterism behavior

The host already manages bundled packages, user-owned directories with completed artifacts, and npm-managed packages through one loader. The settings surface supports local registration, npm package inspection and exact-version install/update, build-script approval, progress/cancellation, enable/disable, and removal. `src/plugins/npm-installation.ts` stages and validates the managed artifact before publishing a new selection. A failed or cancelled installation does not replace the old selection; startup initialization failure is a separate outcome and does not silently roll back code or data. Starting the application uses the local selection, not a registry lookup. `PluginsSettings.tsx` shows pending restart; `NetworkSettings.tsx` already uses the host's normal restart action. No remote discovery surface was found in the current code. Application GUI acceptance and cross-platform verification remain open in the plugin-system follow-up.

## Comparable products

Official documentation and upstream repository docs were inspected; these products were not installed or exercised for this investigation.

- [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/installation-and-management): verified nodes can be installed from the nodes panel; self-hosted administrators can also install by npm package spec. The latter is a separate, explicitly unverified path with a risk acknowledgement.
- [DeepSeek Harness plugin indexes](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/plugin-market.md): experimental Discover beside Installed, driven by static JSON indexes. A listed version opens a source confirmation and then uses the normal installer. Index claims are not a security guarantee.
- [VS Code Extension Marketplace](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace): marketplace, manual VSIX installation, and installed management coexist; the product distinguishes publisher trust, specific versions, and restarting the extension host.
- [Obsidian community plugins](https://help.obsidian.md/community-plugins) and [plugin security](https://help.obsidian.md/plugin-security): users browse, install, and enable third-party extensions; restricted mode ignores them without uninstalling them. This is a recovery/trust reference, not evidence that Asterism has a sandbox or such a mode.

## Recommended first scope

Use npm for distribution, a project-maintained static HTTPS catalog for discovery, and the existing plugin manager as the source of truth for local state. Start with a small curated set of actual plugin releases. A catalog row supplies display metadata and an exact npm package/version; installation goes through the existing preview/confirmation flow. Curated listing is not third-party isolation or certification. Do not use npm keyword search as the default catalog: tagging is self-service and establishes neither publisher trust nor compatibility. Keep manual npm entry and local directory registration available independently of the catalog; a catalog outage must not prevent installed management or offline startup.

Keep two views in plugin settings: Discover and Installed. Keep the existing restart boundary and offer a normal application restart action when a change is pending; do not treat a window reload as activation or add per-plugin hot reload. Distinguish selected and running versions. Local removal unregisters the directory; managed uninstall removes owned code after active use ends, retaining user data. Do not add silent upgrades or a silent fallback after startup failure. A recovery start that skips third-party plugins is a useful candidate before broad third-party distribution, but is not implemented by this proposal.

First manually accept install, restart, update, disable, removal, and failure behavior on the packaged application with one real plugin fixture under a separate data directory. Then add Discover as a thin entry point to the same installer. A dedicated marketplace service, submission accounts, ratings, and public index federation do not serve the first slice.
