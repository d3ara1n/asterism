# Dialog layout and input review

Filed on 2026-11-19 after a report that text appeared outside the history continuation confirmation and its buttons could not be clicked. This is a source review, not reproduction in the running desktop application.

## Coverage

The renderer, builtin plugin, and shared UI contain 11 `AlertDialogContent` and 19 `DialogContent` construction sites. The latter count includes the unused `CommandDialog` helper; shared components may serve multiple entry points. The history action uses the vendored shadcn/Radix `AlertDialog`, with the header, description, details, and actions inside its portaled content. The main-process message boxes are native Electron UI, and the Agent-local command panel is deliberately nonmodal; neither uses the shared modal layout.

The shared primitives keep the shadcn registry's fixed, centered grid layout. The local compiled stylesheet includes the positioning, width, and animation rules. This does not verify which styles the affected build applied at runtime.

## Findings

- Both shared content components lack a default viewport height limit and a scroll owner. Several larger dialogs add their own limits, but history continuation does not. Enough disposal warnings or other content can make a centered dialog taller than the viewport and put its footer out of reach. A constrained outer width also does not constrain the implicit grid column's minimum content width. An unbroken label or warning can force the track wider than the panel; `break-words` does not lower the text's min-content size.
- History disables confirmation while the target history is being read, disposal notices are loading, or the session is busy or navigating. A target read failure keeps confirmation disabled until a successful retry. Cancel is disabled only while a continuation is being submitted. These gates are separate from pointer hit testing; they do not explain a dead Cancel before submission.
- `CommandDialog` renders its visually hidden title and description outside `DialogContent`. Move them inside the content so the accessible name and description are in the modal subtree if this helper is used. There are no current call sites, and the application's active command palette does not use it.

## Disposition

The shared shadcn/Radix dialogs now cap height against the viewport, allow long words to wrap in a shrinkable grid column, and scroll by default. Callers with inner scrolling can override outer overflow. `CommandDialog` now places its accessible title and description inside the modal subtree.

History continuation shows the target timestamp or session start instead of an event snippet. Resource warnings and retry feedback scroll independently of the header and footer. This changes presentation only; history records and continuation guards are unchanged.

Type checks and the production build passed. Electron layout and click behavior still need manual acceptance. Check history with a long event and multiple warnings, then spot-check a removal confirmation and a regular form. If a visible, enabled button still misses clicks, inspect the scrim, portaled content, and Electron drag-region overlap.
