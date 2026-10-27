# Expose plugin documentation

A plugin can make its documentation and examples available through Asterism's Manual resource. The manual exposes the declared directories directly. The same files remain usable in an editor or another development environment.

## Declare directories

Add a `manual` array to the plugin's existing `asterism` manifest:

```json
{
  "asterism": {
    "id": "example.bridge",
    "manual": ["docs", "examples"]
  }
}
```

Each entry names an existing package-relative subdirectory using `/` separators. Entries must be normalized, must not overlap, and must resolve inside the package. Include those directories in the package's distributed files. A documentation declaration does not require a runtime entry.

Declare only directories intended for readers. Source examples can be exposed alongside prose; internal test fixtures and credentials belong outside the declared directories.

## Read through the manual

When the plugin loads successfully, its directories appear under `plugins/<plugin-id>/`. For this example, an article at `docs/usage.md` appears as `plugins/example.bridge/docs/usage.md`. The manual supports directory listing, file discovery, content search, and reading selected lines.

The manual reads current files at their original locations. It creates no copied document tree or index. Source declarations follow the loaded package set: changes to declarations, enabling, disabling, or removing a plugin take effect after restart. Plugins with package, startup, or storage failures do not contribute documents.

A search at a virtual parent covers the directories below it. Globs apply within each selected physical search directory. Results include the complete virtual path, so identical filenames in different plugins remain distinguishable. Reading a file or following an explicitly selected symbolic link remains within the declared directory.

## Write independent articles

Each article should explain its purpose, relevant concepts, prerequisites, and working method without depending on a reading sequence. Keep the context needed to understand the topic in the article itself. Use examples to clarify operations and leave complete interface definitions to the public types.

Maintain documentation with the domain that owns its meaning. Generic host capabilities belong to the SDK; a plugin's resource behavior and domain extensions belong to that plugin or its public API package. Documentation is reference material and does not become a system instruction merely by appearing in the manual.
