# SDK interface proposal

Archived reference from a draft filed on 2026-10-12. The original document was a review-stage proposal with accompanying declaration prototypes, not an executable SDK or blanket implementation approval.

The host and plugins would share service and contribution interfaces. The SDK would describe generic session, resource, record, model, task, and presentation mechanisms. Agent, note, directory, and naming semantics would remain in the built-in domain.

The proposal covered typed contracts and decoding, record envelopes, bound session/object access, synchronous commits, post-commit observation, input preparation, managed work, title changes, model requests, renderer views, and source-package loading.

Confirmed at the time were package-based plugins; restart-based activation; frozen runtime registration; explicit package-root selection; esbuild compilation; shared public dependencies; typed renderer slots with isolated errors; and object data transport. The first step would adapt existing storage rather than redesign it.

Cross-plugin commands replaced an earlier post/receive concept. Managed tasks belonged to the current application run. Initial public packaging and templates were deferred.

Title provenance and priority, final package/manifest naming, and exact channel/view interfaces remained unresolved in this draft. Proposed revision checks and declaration shapes describe that historical design, not current requirements.
