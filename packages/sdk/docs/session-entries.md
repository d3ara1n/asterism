# Provide a session entry

A session contains a history tree and a workbench. A plugin can start work with any supported resources, or with an empty workbench. An initial message and an Agent resource are optional domain choices.

## Own the starting interface

Declare a session entry in the renderer plugin. Its body owns the controls, draft, pending state, and error presentation. The host supplies readiness and an operation that opens the resulting session.

Home displays a single available entry directly. Users choose among several entries in General settings. An explicit selection that becomes unavailable stays unresolved until the user chooses another entry. Resource templates remain available independently of the selected entry.

## Prepare and initialize

Use a typed plugin call for submission. Its backend implementation performs business validation and calls `plugin.createSession` with a retry key. Prepare each required resource through the supplied preparation context, using the original registered creation contract.

Preparation can perform asynchronous work. It returns an initial title and a synchronous initializer. The initializer creates prepared resources and writes initial records or current data through authorized object handles. Session identity, resources, initial writes, and the retry receipt commit together. A failed preparation or initializer leaves no partial session.

When initial work uses an existing resource action contract, prepare that action against the resource token before initialization. This applies its parsing and registered preparers to the initial input as well. The pending resource has its final identity, but no persisted state yet. The owning plugin validates its initial business state and uses the prepared input in the initializer.

Reuse the key for a retry of the same accepted submission. Keys belong to the contributing plugin. A successful retry returns the existing session without repeating preparation or initialization. A new piece of work uses a new key.

## Carry attachments

Obtain a renderer content input for the submission call. Pass that input as the call's content option. The backend receives a content reader separately from business input and forwards it to session creation.

Content IDs alone grant no access. Only authorized referenced bytes enter preparation and initial writes. Persisted references retain those bytes after the temporary draft closes.

## Name the work

The entry supplies the initial title. Later user or plugin title assignments append host history. Continuing from an older position restores that path's latest title, or the initial title when the path has no assignment.

A paradigm can attach its own typed detail to a title assignment and implement automatic naming policy. The host preserves that detail and provides generic title operations.
