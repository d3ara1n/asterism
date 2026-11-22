# Platform appearance profiles

Filed: 2026-11-20

Status: Superseded on 2026-11-22. The user chose the shell-and-sheet surface language with interaction motion as the application-wide direction, which replaces the glass target below. The prototype findings remain as historical evidence.

## Product direction

**Visual target:** Build a coherent glass control system for Asterism with MCHOSE HUB’s `driver-ui` as the primary reference. The user prefers its interpretation of liquid glass to Apple’s. The target is the shared visual language across controls and surfaces, not a hover effect pasted onto the existing theme.

- **Base appearance:** Keep the existing shared Asterism control style. Use native window materials where already supported: Acrylic on Windows and `under-window` vibrancy on macOS, with the existing solid fallbacks.
- **Windows platform appearance:** Explore a Mica backdrop with a coherent Fluent-inspired control and surface system. Do not assume a second component library is necessary.
- **macOS platform appearance:** Use the `driver-ui`-inspired glass system as the target for web controls. Explore a native Liquid Glass backdrop separately as a platform integration option; AppKit does not set the visual target for the controls.

Platform options are exploratory. Linux behavior, naming, OS support, fallback behavior, and whether switching must be immediate are not yet specified.

## Prototype finding

A development-only prototype switched one root attribute to restyle existing shadcn/Radix slots, including menus and dialogs portalled to the document body. The glossy variant used a separate, clipped blur layer that followed the pointer. It did not change native window materials or load the MCHOSE bundle.

The user rejected the visual result: some changes were hard to see, and the visible effects felt disconnected and fragmented. Build checks did not assess visual quality. The prototype was removed. This rules out promoting that CSS-overlay prototype; it does not establish that switching coherent appearance profiles is infeasible in Electron or React. Keep the idea of a single appearance selection separate from the way each shell surface and shared control implements it.

MCHOSE's publicly delivered [`driver-ui` bundle](https://cdn.mchose.com.cn/customPage/driver-ui/driver-ui.global.js) provides technical evidence for clipped, pointer-reactive blur. This explains one effect, not the full visual system. No reuse license for the library was located during the initial investigation. Do not plan around importing or redistributing the bundle.

## Research and design before implementation

1. **Study complete workspaces.** Start with MCHOSE HUB in use: document idle surfaces as well as hover, press, selection, and the transitions between them. Compare platform guidance and real desktop apps on Windows and macOS for context. Decide how window chrome, sidebars, reading surfaces, toolbars, menus, and dialogs relate before designing individual glow effects. Use a real Asterism workspace with a sidebar, conversation, composer, and open menu, not a component gallery, to evaluate the first direction.
2. **Verify native material support separately.** Electron exposes Mica on supported Windows versions. AppKit's macOS 26 [`NSGlassEffectView`](https://developer.apple.com/documentation/appkit/nsglasseffectview) is not an Electron `setVibrancy()` option; using it as a backdrop in a window hosting Chromium is unverified. Evaluate composition, OS support, inactive windows, accessibility settings, and fallbacks on actual platforms. A renderer prototype need not depend on a native glass experiment.
3. **Define the scope of a profile switch.** Evaluate a common selection resolved into native window treatment and shared renderer presentation. Prefer preserving control semantics, focus and state, and reuse `packages/ui` where possible. Identify where a different visual structure is justified, such as a continuous light layer across one segmented track. Establish what plugin views using shared controls inherit and what remains plugin-owned.
4. **Get visual acceptance before generalizing.** First show one coherent static platform appearance on a real workspace in light and dark modes. Only then test one interactive light treatment. Check readability, keyboard focus, selection, reduced transparency and motion, and high contrast. If the static treatment does not stand on its own, stop rather than compensating with more effects.
