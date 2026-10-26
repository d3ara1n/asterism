# Workbench panels and resource presentation

Completed on 2026-10-10. Temporary prototypes, preview commands, and artifacts were removed.

Resources supplied static type identity, label, and icon independently of card content. Object navigation used a flat searchable list, restored hidden views before locating them, and kept removal separate.

History used individual append order and structured source filtering. Resource identities remained distinguishable after removal and across branches. Authorization moved into a workbench island using actual directed links.

The user confirmed basic locating transitions and history filtering. Typechecks, build, and targeted tests passed.

The recorded historical implementation still included a separate viewing position, continuation snapping, and navigation generations; those mechanisms were subsequently revised.

Specialist acceptance for authorization errors, concurrent branches, narrow windows, and keyboard interaction remained outstanding. Long-history pagination and virtualization were not delivered by this task.
