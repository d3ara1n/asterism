# Unify layout concepts and names

Filed on 2026-11-06. Deferred terminology work. The docked layout is implemented; concept and naming unification remains open.

## Problem

The current layout vocabulary blurs page switching, Island coordination, and visual surfaces. `Space` switches declarations named `ScreenSpec` and renders `.space-screen` elements, while a nested `Screen` component coordinates Islands. The `surface` property controls visual treatment rather than identifying a page container.

The discussion used "Surface" as a provisional name for a whole page. It is not an approved replacement name.

## Responsibility model

- `Space` coordinates whole-page switching, such as the main page and settings. Inactive pages remain mounted and inert under the current implementation.
- A whole-page container provides composition and ordinary layout. It does not need another coordination mechanism merely to contain neighboring regions.
- `Screen` coordinates Islands: their arrangement, focus following, and associated operations.
- Visual surface treatment is distinct from both page identity and Island coordination.

The main-page composition has a session sidebar, a central Island-coordinating `Screen`, and an optional auxiliary panel as neighboring regions. The two side regions remain within the main page's viewport while open; only the central Island region moves with Island focus. All three leave together when switching to settings. Side regions intentionally reduce the central region's available width; preserving that width through automatic hiding or overlays is not the intended behavior. Users explicitly hide the sidebar or close the auxiliary panel.

The layout was implemented after this task was filed. Visual acceptance remains separate from terminology work. Naming changes should preserve this responsibility boundary without introducing additional navigation or responsive behavior.

## Deferred work

- [ ] Review layout terminology across implementation and maintained documentation, including existing uses of Screen, Space, Surface, Island, and panel.
- [ ] Propose a consistent vocabulary that distinguishes whole pages, page composition, Island coordination, and visual treatment; obtain agreement before changing domain terminology.
- [ ] Apply the agreed names consistently to relevant components, types, styling hooks, comments, and maintained documentation without incidental behavior changes.
- [ ] Verify that the resulting terminology describes actual responsibilities and does not imply an additional page-container coordinator.

## Validation

Check terminology, English language, semantic accuracy, and standalone readability. If implementation identifiers change, run the affected typechecks and builds. Behavioral layout changes require their own implementation scope and user visual acceptance.
