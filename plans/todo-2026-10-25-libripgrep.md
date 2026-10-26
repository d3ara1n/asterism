# Native search-library evaluation

Filed on 2026-10-25. Waiting for Windows support.

The chosen future direction is the Node N-API libripgrep binding. At filing, upstream declared Linux/macOS support and a newer Node requirement; that statement did not refer to the Rust ripgrep libraries.

- [ ] Verify released Windows support, target architectures, Node/Electron compatibility, and distributable artifacts.
- [ ] Verify cancellation, streaming, ignore/glob semantics, encoding, and performance against the current search behavior.
- [ ] When those requirements are met, replace the packaged rg subprocess and remove its dedicated protocol and packaging dependency.
- [ ] Complete three-platform verification before closing the migration.

Until migration is accepted, Asterism continues to distribute and use its rg binary. No upstream support date is assumed.
