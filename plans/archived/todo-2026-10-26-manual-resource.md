# Internal manual access

Filed on 2026-10-26. Initially deferred; resource and tool access is now implemented.

The manual is English Markdown for models helping users use Asterism or develop plugins. Users receive explanations through conversation rather than an external documentation site.

Each page explains its topic independently. Models discover relevant files and combine the information they need. Pages do not require cross-document links, source-file indexes, version catalogs, or exact API inventories.

Engineering documents are a separate collection for developing Asterism itself and are outside the built-in manual.

## Completed work

- [x] Decide how the manual is distributed with the application.
- [x] Expose its files through the resource and tool model.
- [x] Support discovering relevant files and reading selected content on demand.
- [x] Verify that software-use and plugin-development topics can be found and understood independently.

At filing, resource identity, linking behavior, and exact tool interfaces were undecided. The manual remains ordinary documentation, not a skill package or an always-injected system prompt.

## Disposition

The approved design uses a separate `manual` resource with parameterless creation and empty state. It stores neither a document snapshot nor an installation path. Its `list`, `find`, `grep`, and `read` implementations share directory mechanisms and result views. Resource links and agent tool policy govern access. Both the workbench menu and the agent creation catalog expose the resource.

The application distributes `docs/manual/**/*.md` as unpacked installation assets for native ripgrep access. Engineering documents and planning records are outside the manual. The running application supplies the document root; application updates supply the current edition.

Validation includes TypeScript checks, the application build, bilingual message checks, and 37 existing filesystem tests. Direct tool execution found and read both software-use and plugin-development topics using the real manual and packaged ripgrep dependency. The introductory pages were checked for independent readability. GUI interaction and installed-package execution remain for manual acceptance.
