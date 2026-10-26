# Immutable model input

Filed on 2026-10-12. Implementation and automated checks completed; the user confirmed real-endpoint and GUI acceptance on 2026-10-13.

Input became ordered text/file parts backed by immutable content references. Pure-file input remained an ordinary message. Input history and its content roots committed together, with independent draft and request leases.

The three protocols encoded actual media types through their adapters. The client did not infer input acceptance from a model-name or modality whitelist. Invalid ownership, damaged content, and exceeded budgets failed explicitly.

Home and Agent input supported picking, pasting, dragging, removing, cancelling, and retrying files. History retained attachment identity rather than rereading the original local path. File input did not create placeholder resource cards.

Typechecks, tests, build, and localization passed using isolated storage and injected transports. User acceptance separately covered real models, pure and mixed input, failure feedback, history, branches, and directory image viewing.

This delivery did not implement media output, real-time audio/video, conversion, or general cross-object sharing. Historical SDK/storage versions and byte limits described that release stage, not ongoing manual requirements.
