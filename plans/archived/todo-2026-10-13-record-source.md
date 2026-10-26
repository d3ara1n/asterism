# Record provenance

Filed on 2026-10-13. Design was confirmed, implemented, and archived.

A unified source replaced an agent identifier that had mixed emitting identity with associated-object meaning. The host stamped plugin identity, and bound resource operations supplied validated emitting-resource identity.

Associated objects and model recipients moved into their own payload or routing fields. History presentation and filtering used actual emitting source, preserving distinction among identically named resources.

The naming design consolidated attempt information into successful naming events. Consumers, storage, and public record interfaces were updated together.

Typechecks, tests, and localization checks passed. The historical host-source representation and interface shapes subsequently evolved; this record captures the reason for separating provenance from association.
