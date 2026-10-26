# Plugin system-prompt contributions

Filed on 2026-10-21. Direction only; no public contribution interface is established.

Plugins should be able to contribute instructions that the Agent composes at a request boundary. Built-in descriptions such as message-envelope meaning should use the same mechanism.

Envelope meaning is separate from a send tool's use. A direct Agent resource already identifies the receiver; internal addressing within a future relay belongs to that relay.

- [ ] Decide contribution identity, declaration, order, applicability, and release.
- [ ] Separate static registration from values captured for each request.
- [ ] Integrate built-in envelope descriptions through the same contribution mechanism.
- [ ] Clarify implementation-specific tool guidance needed by future relay resources.
- [ ] Verify request stability, public identity, and lifecycle behavior.

The contribution should preserve the captured request environment and stable top-level context.
