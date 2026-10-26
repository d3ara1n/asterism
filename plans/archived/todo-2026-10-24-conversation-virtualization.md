# Conversation virtualization

Filed on 2026-10-24. All listed implementation items completed.

Long conversations caused canvas rendering cost to grow with mounted elements. The work adopted virtua for dynamic-height virtualization and retained live output plus the final item as required.

Block generation times became domain data so durations survived restart. User-chosen disclosure and detail state belonged to the Agent's retained item state, preserving it through scrolling and focus changes.

The library owned item measurement and scroll compensation. Output following used resize information, while user reading gestures and input-message navigation changed the scroll intent.

The design rejected a content-visibility stopgap because it retained DOM growth and would still require state migration later. A self-built virtualizer was also unnecessary.

Recorded manual acceptance covered size measurement under canvas zoom, preserved disclosure, reduced long-session rendering cost, saved timing, latest-output following, and input navigation. File previews could briefly show an icon while reloading on remount; the task did not claim that behavior eliminated.
