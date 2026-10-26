# Immutable content

The content store stages, seals, reads, and retains immutable bytes. Plugins interpret file formats; views and model adapters consume content through their own contracts.

## Identity and persistent roots

`ContentRef` is a reserved JSON value identifying immutable bytes. Only the exact validated reference shape has reference semantics. Paths, strings, hashes, and objects with extra fields remain ordinary JSON.

The host scans final validated persistent JSON for references, checks ownership and availability, and saves dependency roots in the same transaction. Plugin absence or schema decoding failure does not invalidate previously saved roots.

Stringifying a reference, placing it in a prompt, or saving it in a plugin-private file does not create a root. Transforms that remove a reference also remove it from the final dependency set.

The public identity contains no physical path, filename, media type, or authorization. Consumers own names and format declarations; the store owns byte integrity.

## Temporary leases

Input drafts bind to a typed creation or action contract. Each submission attempt captures an independent lease before asynchronous preparation. Subsequent draft changes do not expand that attempt’s eligible content.

Drafts and attempts retain their own leases. A failed attempt can leave its draft available for retry. Closing a draft prevents new uploads and attempts while existing attempts finish under their own lifetime.

Backend creation and invocation capture references from a legitimate content reader. An explicit content option can transfer an eligible reader scope; copying a reference does not transfer that eligibility.

The resource’s own preparer can stage content; an external preparer reads only. Preparation does not write object state or establish persistent roots. Replacement inputs pass through the owner’s schema and content checks.

Stage and process bytes outside synchronous transactions. Sealing makes bytes immutable. Creation and commit validate sealed references and save roots without awaiting file transfer or hashing.

## Scope and ownership

Content access follows the calling facade:

| Owner or scope | Retention and access |
| --- | --- |
| Current data | Replaces the dependency set for its session, object, and data contract |
| Historical record | Retains references for the life of that record |
| Template | Retains independent roots outside the source session |
| Input attempt | Retains captured input through preparation, queuing, execution, and commit |
| Object execution | Reads eligible object data, captured history, and staged output |
| Nested session reader | Reads session-level roots, not arbitrary object contents |
| Frontend object view | Reads the object’s current execution path |
| Model request | Retains eligible input independently until the request and tool batch settle |

Backend private current-data access remains scoped to the owning plugin. An associated object reference does not expose another plugin’s private state.

Object removal, unlinking, card hiding, branch changes, and plugin removal preserve historical roots. Current data is shared across branches. Old bytes survive a current-data replacement only while another root or lease retains them.

Template instantiation establishes new record and current-data roots using the same immutable identities. It does not grant plugins a general template-content reader.

## Transfer and collection

Frontend uploads use bounded, ordered chunks and acknowledgments. Bytes enter temporary storage, then sealed storage, before persistent JSON can reference them. Public author interfaces hide the chunk transport.

Collection removes content only when persistent roots, draft/run leases, and active reads are all absent. Retention changes and collection serialize; elapsed time does not prove a reader has finished.

Startup collection runs explicitly after successful data preparation. Store construction itself does not delete files.

Sealed files are never modified in place. Recovery points may therefore hard-link their bytes. Complete reads verify integrity; ranged reads verify the stored length.

Model input and tool-result files use the same ownership mechanism. Tool output transfers its execution lease to the request, and the saved outcome establishes its persistent roots atomically.
