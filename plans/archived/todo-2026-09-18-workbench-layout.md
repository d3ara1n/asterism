# Workbench layout

Filed on 2026-09-18. Implementation completed; the user confirmed the result and authorized a commit before archival.

New cards used complete declared geometry to find nearby free space. Backend and frontend shared size information, model-created objects preferred the caller's location, and existing cards retained their positions.

Explicit arrangement used ELK over visible cards, including different sizes, bidirectional links, and isolated objects. Positions committed together; size, folding, visibility, and selection remained unchanged. Repeated arrangement preserved graph center. Navigation or cursor changes cancelled uncommitted work.

Object focus in a separate leading island was also available. Shared geometry declarations and author examples were updated.

Typechecks, build, and localization checks passed. Focused tests covered placement, sequential creation, size overrides, atomic position writes, rollback, and layout drift. User confirmation did not claim exhaustive theme, window-size, or scale testing.
