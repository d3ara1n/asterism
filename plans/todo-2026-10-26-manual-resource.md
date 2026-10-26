# Internal manual access

Filed on 2026-10-26. Deliberately deferred; this task does not implement resource or tool access.

The manual is English Markdown for models helping users use Asterism or develop plugins. Users receive explanations through conversation rather than an external documentation site.

Each page explains its topic independently. Models discover relevant files and combine the information they need. Pages do not require cross-document links, source-file indexes, version catalogs, or exact API inventories.

Engineering documents are a separate collection for developing Asterism itself and are outside the built-in manual.

## Remaining work

- [ ] Decide how the manual is distributed with the application.
- [ ] Expose its files through the resource and tool model.
- [ ] Support discovering relevant files and reading selected content on demand.
- [ ] Verify that software-use and plugin-development topics can be found and understood independently.

Resource identity, linking behavior, and exact tool interfaces remain undecided. This is ordinary documentation, not a skill package or an always-injected system prompt.
