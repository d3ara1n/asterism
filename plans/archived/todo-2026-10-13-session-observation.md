# Session observation proposal

Filed on 2026-10-13. Closed as a superseded proposal, not as an implemented feature.

The proposal sought a generic way for the application shell to observe titles and resource activity without reading complete session bodies or depending on Agent-specific semantics.

At filing, generic session-change notifications caused throttled sidebar rereads, while progress reporting was tied to agents. The proposed work separated precise changes such as title updates from broader state refresh.

Open design choices included event classification, resource-owned status reporting, dispatch ownership, and whether progress would share the same protocol.

The intended result was application subscription to business events with one dependency direction. A later event-and-call effort took over implementation; this archive does not establish its completion.
