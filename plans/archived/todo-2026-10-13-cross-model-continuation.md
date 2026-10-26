# Cross-model continuation

Filed on 2026-10-13 and archived on 2026-10-19. Shared target projection was implemented and automatically verified; real endpoint/model/tool combinations remained subject to observation.

Every request projected public history toward the selected model without rewriting stored content. Model changes did not invalidate all common text and tool history.

Native signatures, ciphertext, and identifiers were reusable only within their recorded source scope and adapter version. Switching from A to B and back to A preserved A's original native data for reuse. Text and summary remained separate and were not fabricated from ciphertext.

Tool identifiers transformed deterministically where necessary, keeping each call/result pair aligned. Protocols differed in their supported historical reasoning representations.

Isolated protocol tests covered cross-source filtering, original-prefix preservation, adapter changes, reasoning separation, and tool pairing. They did not prove every live provider combination.

Future native protocols would need their own continuation namespace handling. Research informed the design but did not make other agents' persistence formats part of Asterism.
