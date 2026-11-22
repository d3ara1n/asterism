# Engineering documentation

This collection supports development of Asterism itself. It explains architectural responsibilities, design constraints, and the reasoning needed to change the software coherently.

Documents cover the object model, historical records, execution, plugin hosting, persistence, configuration, interface behavior, and delivery. Each topic is self-contained rather than a dependency in a reading sequence.

Implementation details are discovered from the current code when needed. Stable directory maps can explain responsibilities; per-file source indexes, API inventories, version catalogs, and duplicate feature checklists are unnecessary.

Explain generalized design results directly. Research provenance, inspected versions, and review evidence are temporary working material managed with tasks, not part of the engineering explanation. A design remains understandable without access to its original investigation.

## Documentation ownership

Choose a primary home by the question the information answers. Another surface can explain the consequences for its audience without becoming a parallel reference.

| Question | Primary home |
| --- | --- |
| What can I create, and what do I need to know before creating it? | Creation entry description, guidelines, and input schema |
| What is this linked resource's current state? | Resource-owned discovery and inspection state |
| How do I perform an operation, interpret its result, and understand its execution boundaries? | Owning tool description, guidelines, and input/output schemas |
| What should the interface communicate at this point of use? | User-facing controls, labels, and contextual feedback |
| When should I choose a resource, what does it relate to, and why did it behave this way? | Resource sections in the user manual, grounded in current behavior |
| How should a plugin author choose integration boundaries and use the public model? | Plugin-author manual and public-package guides; types and executable examples own concrete interfaces |
| What internal design should implementation preserve? | Engineering documentation; local implementation rationale belongs in code comments |
| What responsibilities, procedures, and completion criteria has the user selected? | Role instructions, skills, and task instructions |
| What was deferred or investigated, or what did a review find? | `plans/` tasks (`todo`), references (`ref`), and reviews (`review`) |

### Manual scope

`docs/manual/` serves users and plugin authors, including public-package guides exposed through the Manual resource. It explains mental models, usage choices, and responsibility boundaries. Models consult relevant topics on demand; ordinary tool use is self-contained through discovery. Internal engineering documents serve maintainers.

Group application resource topics in `docs/manual/using/resources/` by shared usage questions rather than by individual tools. Cover each resource's role, when to choose it, meaningful relationships, and tradeoffs or common mistakes. Include behavior and lifecycle caveats that help readers set expectations or understand an observed result. Briefly identify each resource so the section stands alone; related resources can share a chapter.

Manual and engineering topics include enough context to stand alone without cross-document reading. The manual can restate verified behavior to explain a caveat and use examples to illustrate a choice. Tool catalogs, invocation recipes, input and output inventories, defaults and limits, and control-by-control walkthroughs belong in the owning contracts or interfaces.

### Placement and completeness checks

1. **Classify each claim.** Separate current state, operational contracts, user-selected procedures, and conceptual explanations. For example, a schedule's activation requirements belong in its contract; how session sleep affects reminders can also belong in the manual as a user-facing caveat.
2. **Verify the owner.** Read the implementation and relevant creation, resource, or tool projections. Check what the reader can actually discover, not just whether a schema or manual section exists. Source code, types, schemas, configuration, and executable examples own current behavior; proposals and old acceptance records do not.
3. **Keep the distinct explanation.** Retain prose that explains a choice, expectation, or observed outcome beyond discoverable facts. Put missing operational facts in the owning contract. Implementation changes alone do not require a manual update unless they affect what the reader should understand or expect.
4. **Account for removals.** Identify obsolete and redundant material. Preserve any unique, necessary guidance in its proper home before removing it, and verify it is discoverable there. Check for both duplicate facts and missing conceptual coverage across resources.
