# Investigate application startup cost and shutdown completion

Filed on 2026-11-16. Startup measurements, application acceptance, and the reported shutdown residual remain unresolved. The user selected explicit, source-independent plugin artifacts on 2026-11-17; the builder and replacement loader are implemented.

## Problems

Plugin compilation was a substantial part of the recorded startup cost. It now belongs to an explicit per-plugin build operation rather than application startup. Independent provider/consumer graphs, captured immutable artifacts, native module identities, and packaged builtin loading have process-backed evidence. Comparable end-to-end application measurements and manual acceptance are still needed; compiler or Node-process timings alone do not establish startup performance.

The user also reported a window disappearing after a quit request while a process remained. Business cleanup completed in the observed logs, but the cause of the reported residual process was not established. This is a separate issue; a causal relationship with startup failure or frontend loading was not demonstrated.

## Further investigation

- [ ] Establish comparable development and installed-application startup measurements, distinguishing process launch, window availability, backend readiness and frontend usability. Include any build work performed before application launch.
- [ ] Determine how plugin count, shared dependencies and frontend contributions affect startup work across separate process lifetimes.
- [x] Select and implement source-independent prebuilt artifacts, explicit source builds, immutable output publication, and restart-bound plugin selection.
- [x] Obtain focused process-backed evidence for shared declaration identity, ESM live bindings, host singletons, CSS/assets, plugin failure isolation and current-data admission. Browser/CSP and target-platform acceptance remain part of the application check below.
- [ ] Reproduce the reported shutdown residual and identify which process and lifecycle boundary remain incomplete after the window disappears.
- [ ] Validate any eventual change with process-backed integration evidence and manual application acceptance, including failure cases. Record remaining platform and packaging limitations.

## Completion criteria

The causes and relevant lifecycle behavior are understood, any required product decisions have been explicitly agreed, and the resulting behavior is validated in the actual application. Isolated compiler timings alone do not establish startup acceptance, and business-cleanup completion alone does not establish process exit.

## Reference

- `plans/ref-2026-11-16-startup-investigation.md` records verified behavior, measurements and their limits. It does not select a compiler, cache mechanism or plugin lifecycle.

- `plans/archived/ref-2026-11-17-plugin-artifacts-and-distribution.md` records the selected replacement design and implementation disposition.
