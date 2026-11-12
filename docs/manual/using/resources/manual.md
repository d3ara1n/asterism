# Consult a Manual resource

A Manual resource provides application guidance and public-package or plugin documentation from the running installation. Choose it when the question concerns how to understand Asterism, why a resource behaves as it does, or how to design a plugin integration. A Directory resource is more appropriate when the task is to inspect or change the source of a particular checkout.

## Match the document to the question

The manual explains choices, relationships, and user-facing caveats. Creation descriptions and inspected resource tools explain the currently available operations. An assistant can consult a relevant manual topic when asked about an unexpected behavior without loading the whole manual into every request.

Loaded plugins can contribute their own documentation. The Manual is therefore a collection of sources, not a guarantee that every page describes the same plugin or audience. The source and topic matter when interpreting advice, especially when application guidance and plugin-author material appear in the same search.

## Match the edition to the installation

The resource reads its configured source directories rather than keeping a private document copy in the session. Application and plugin updates can change what it reads. Returning to an earlier conversation does not select the manual edition that existed when that conversation was recorded.

A development checkout can differ from the running application. Linking the installed Manual does not make it the manual for every linked repository. When a question explicitly concerns the latest code, establish which version the documentation describes instead of assuming the two are identical.

Manual views are read-only. A shared Manual supplies reference material, not a shared editing surface or a place to record the user's working decisions. Keep those decisions in the task, a Note, or project files.
