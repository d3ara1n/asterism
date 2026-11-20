# Model-specific resource tool call projection

Filed: 2026-11-20

Status: Deferred beyond the current release. Keep dynamic discovery unchanged for this release. Preserve the design and probe findings for later evaluation; the accompanying guideline only describes the existing `resource_script` alternative.

## Motivation and evidence

In observed sessions, some older models repeatedly failed to assemble `resource_call` arguments and got stuck retrying. Newer models sometimes avoided the generic call even when they could use it, favoring simpler operations such as `exec` and `write` while leaving more specific tools unused. These are model-dependent observations, not benchmark results.

The local Pi hashline extension also uses structured anchors and line-array bodies, but exposes `read`, `grep`, and `edit` as ordinary named tools. Its guidance connects anchored output to later edits before the model chooses how to read a file. Test discoverability and the outer call shape before redesigning anchors. Describe the data flow in the owning tools, not as a directory-owned workflow.

In a development probe, `skill_read` was temporarily removed from current tool declarations and a new turn was sent in a session with a prior `skill_read` call and result. The tested upstream accepted the history, but the model became confused about tool availability. The skill catalog prompt still mentioned `skill_read`, so the probe did not isolate the cause of the confusion. Registration was restored. This was a test of historical tool names absent from current declarations on one provider path, not a test of transformed resource-call replay.

## Proposed request model

- **Configure the resolved model.** When this feature ships, default to **Direct calls**, with **Dynamic discovery** as a per-model opt-in. A model role selects a model; an explicit model override uses that model's setting. Do not add a parallel global, role, or conversation setting. Capture the mode with links and tool policy at request start and hold it for that request and its tool batch.
- **Project rather than register.** Keep registration, resource implementations, and authorization independent of mode. At `bindModelTools`, build the model-facing declarations, dispatch bindings, and inspection view from the same captured environment. Dynamic discovery retains `resource_call`; direct mode exposes named resource tools instead. Both use the same resource dispatcher and validation. `resource_script` resource handles keep their internal dispatch path.
- **Put the complete call shape on the wire.** A direct call uses ordinary tool input fields `{ resource_id, target, args }`. Project a shared contract once, not once per linked instance, and do not enumerate instance IDs in the schema. Use the exact target schema when eligible implementations share a shape. For heterogeneous targets, evaluate a deduplicated union annotated with the applicable resource kinds. The resource ID selects the implementation; no second kind discriminator is needed. The selected implementation still validates its actual target. A Directory `read` or `edit` must be callable without an inspection round trip.
- **Keep inspection guidance neutral.** Bind `resource_inspect` to the captured mode without rewriting its guidelines. In dynamic discovery it supplies the call definitions. In direct mode it reports what the selected resource supports without repeating shared argument schemas. Its schema view can still expose the implementation's target and encoded result for reference and scripts.

## History and resource changes

- Normalize resource calls to the existing canonical `resource_call` shape when recording them. Use the captured binding to distinguish them from ordinary top-level tools; do not infer that distinction from the name. Ordinary top-level calls stay unchanged. On replay, project canonical calls into the selected model's current mode, independent of whether the historical resource is still linked. Preserve call/result pairing and respect provider continuation rules. A mode change does not rewrite stored history, grant access, or need its own availability notice.
- Derive current declarations from current links and policy. Do not keep an append-only catalog or persist tool declaration snapshots for cache stability. In direct mode, supplement the model-facing `resource_detached` notice with the top-level tools actually removed by that event, using the difference between the recipient's effective tool sets before and after the detach. Detaching one of two equivalent directories must not say that `read` or `edit` disappeared; detaching the last linked resource that exposes a tool should name it. Derive this from existing events at request projection, without changing the stored events or adding another state store. Dynamic discovery keeps the ordinary link notice. Attach needs no extra tool list initially: new tools are already declared in the request.

## Checks when work resumes

1. Compare direct and dynamic calls on representative models and the same local editing tasks. Distinguish tools never attempted, malformed outer calls, and calls rejected by the implementation. A directly declared Directory `read` and `edit` should work without inspecting, and adding an equivalent directory should not duplicate declarations.
2. Validate heterogeneous target shapes and name collisions with genuine top-level tools before fixing the schema and alias projection. Check supported tool schema shapes on the relevant provider paths; see [Tool parameter schemas across providers and harnesses](ref-2026-11-04-tool-schema-provider-compatibility.md).
3. Test history replay in both directions, with ordinary top-level calls mixed in and a resource no longer linked. Verify that call IDs, results, and provider continuation data remain correctly associated. The `skill_read` probe does not establish that rewritten calls can carry native continuation data unchanged.
4. Check that detach notices on the active branch name only actual removals and that an unlinked resource ID is still rejected. Measure cache behavior when declarations change; do not assume prefix reuse across provider paths.
