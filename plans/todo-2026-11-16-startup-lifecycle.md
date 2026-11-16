# Investigate application startup cost and shutdown completion

Filed on 2026-11-16. Deferred, unresolved. No implementation approach or change to plugin behavior has been selected.

## Problems

Plugin compilation is a substantial part of the recorded startup cost. The unresolved question is how to reduce that cost reliably for multiple independent and interdependent plugins, without stale code or unapproved changes to plugin behavior. A single-package improvement does not establish behavior or performance for a larger plugin composition.

The user also reported a window disappearing after a quit request while a process remained. Business cleanup completed in the observed logs, but the cause of the reported residual process was not established. This is a separate issue; a causal relationship with startup failure or frontend loading was not demonstrated.

## Further investigation

- [ ] Establish comparable development and installed-application startup measurements, distinguishing process launch, window availability, backend readiness and frontend usability. Include any build work performed before application launch.
- [ ] Determine how plugin count, shared dependencies and frontend contributions affect startup work across separate process lifetimes.
- [ ] Investigate reliable ways to reduce repeated work. Establish the expected behavior for source, configuration, dependency and plugin-selection changes before accepting an implementation.
- [ ] Evaluate correctness across shared declaration identity, ESM live bindings, host singletons, CSS/assets, plugin failure isolation and current-data admission/migration.
- [ ] Reproduce the reported shutdown residual and identify which process and lifecycle boundary remain incomplete after the window disappears.
- [ ] Validate any eventual change with process-backed integration evidence and manual application acceptance, including failure cases. Record remaining platform and packaging limitations.

## Completion criteria

The causes and relevant lifecycle behavior are understood, any required product decisions have been explicitly agreed, and the resulting behavior is validated in the actual application. Isolated compiler timings alone do not establish startup acceptance, and business-cleanup completion alone does not establish process exit.

## Reference

- `plans/ref-2026-11-16-startup-investigation.md` records verified behavior, measurements and their limits. It does not select a compiler, cache mechanism or plugin lifecycle.
