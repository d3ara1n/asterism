# Vendored UI maintenance

Shared registry components live in `packages/ui/src/ui/` alongside project-owned controls. Host-only registry components such as `sonner` and `chart` live in `src/renderer/shared/ui/` so plugins do not receive them through the shared UI modules.

## Import or update a registry component

1. Check the registry and inspect its source before replacing a file. Run `npx shadcn@latest add <name>` from the repository root; the `packages/ui` config cannot resolve its workspace aliases. If alias validation rejects `lib` or `hooks`, use `npx shadcn@latest add <name> --view` to inspect the source and apply it locally.
2. Normalize the imports after an add or overwrite. The root config can rewrite the `cn` helper import to the npm package `cn`. Remove that unintended dependency if added. Restore relative imports for shared components (such as `../utils` and `./button`); host-only components import `cn` from `@asterism-app/ui/utils`.
3. Compare the new source with the local differences below. Drop fixes the registry now supplies, preserve the differences still needed, and remove entries when a customization moves out of the registry file. Keep the shared import paths and behavior stable for the host and plugins.

`orb` and `orb-core` come unchanged from the Thinking Orbs registry (`https://thinkingorbs.com/r/orb.json`). Copy the published files from the registry item into `packages/ui/src/ui/` because the CLI cannot resolve the package's aliases.

## Local differences to preserve on update

- `input-group`: `InputGroupAddon` click focuses `[data-slot=input-group-control]` instead of the first `input`, so textareas receive focus and hidden file inputs are skipped.
- `button`, `badge`: `destructive` uses `text-destructive-foreground` without dark overrides, `link` uses `text-primary-text`; button adds the `selected` variant, badge adds `success` and `warning`.
- `button`, `toggle`: disabled state drops `pointer-events-none` so tooltips still open on disabled controls; the host `hover` variant skips disabled elements instead.
- `empty`, `field`, `item`: link hover uses `text-primary-text`.
- `dialog`, `popover`: accept a `motionPreset="command"` opt-in for shared command-surface motion; dialog applies matching scrim timing.
- `dialog`, `alert-dialog`: content uses a shrinkable grid column, wraps long text, and scrolls at a viewport-relative maximum height by default. Callers that own inner scrolling can override the overflow.
- `command`: `CommandDialog` puts its accessible title and description inside `DialogContent` and opts into command-surface motion; `CommandList` animates content height by default and accepts `animateHeight={false}` when a parent owns sizing.
- `dialog`, `command`, `spinner`: built-in labels come from `useI18n()` and `commonMessages`; `DialogContent` accepts `closeLabel`, and `CommandDialog` title and description default to localized messages.
- `tooltip`: Provider defaults to a 700 ms hover delay with no skip-delay window; explicit timing props remain supported. Content uses the floating surface (popover tone, border, shadow) without an arrow, with a 4px side offset, 8px collision padding, and a bounded maximum width. For focus-triggered hints, the trigger opens only on keyboard focus, so focus restored after a pointer interaction does not show the hint.
- `hover-card`, `tooltip`: use the shared command-surface motion from the trigger-facing edge, with travel shortened below the default side offset so the surface never covers its trigger.
- `progress`: forwards `value` to the Radix root so the value attributes are exposed.
- `toggle-group`: adds the `segmented` variant, a recessed track whose single indicator travels to the selected item; items then use the default toggle styling without their own selected fill.
- `chart` (host): the dark theme selector is `[data-mode=dark]`; the tooltip uses the popover surface with sans tabular figures.
- `scroll-area`: exposes viewport refs/props and content styling; supports both axes; uses an explicit Radix content element with caller-controlled display, a transparent track, and a semantic overlay thumb; normalizes Radix pointer coordinates for scaled canvases.
- `message-scroller`: the jump button's screen-reader label comes from `commonMessages`; a nested Radix root preserves the primitive root's ref registration, while Viewport and Content compose through `asChild` so the same viewport owns scrolling and an overlay scrollbar; the viewport drops `scroll-fade-b` and native scrollbar styling.
