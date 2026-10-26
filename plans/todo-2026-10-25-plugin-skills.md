# Plugin-carried skills

Filed on 2026-10-25.

A shared runtime catalog already supplies skill summaries at request boundaries and reads package text on demand. Plugin registration remains unimplemented.

The confirmed source priority is user directories above plugins above built-in skills. Source identity describes provenance and grouping; skill names select effective entries.

- [ ] Decide how a plugin declares its skill directory.
- [ ] Define registration and cleanup with plugin lifetime.
- [ ] Define local refresh scope.
- [ ] Expose the plugin registration capability once those contracts are settled.

Plugins should not need to intercept every model request to inject their skill catalog.
