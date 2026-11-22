# Shell-and-sheet surface language and interaction motion

Filed: 2026-11-22
Status: Stage 1 accepted. Stage 1b (design language and lineless groups and blocks) implemented; visual acceptance pending. The user approved the direction and its staged rollout. Each stage needs the user's visual acceptance in light and dark modes before the next starts.

## Direction

Asterism currently mixes two surface languages. Object cards, the Agent composer tray, and the settings root island use a shell and sheet: a `card-shell` base holding content on a raised `surface-inset` sheet. Panel islands opened from lists (provider, plugin, and MCP details, the recycle bin) and the Home and usage cards use a single `surface` card with a bordered header. Placed side by side, as when settings opens a provider detail, the two read as different products.

The user chose the shell and sheet as the application-wide language and asked for richer motion in the same pass. This direction replaces the deferred platform appearance profiles plan and its glass target; that plan is archived as superseded.

## Surface rules

- An island or card is a shell. Its title bar and navigation sit directly on the shell; reading and editing content sits on one inset sheet.
- Radii nest concentrically: the sheet radius equals the shell radius minus the inset and border. When a surface sits inside a container with a wider gap than its own radius, match the container radius rather than forcing concentricity to zero.
- Floating content inside a shell, such as the composer tray, may add the shared floating shadow. Feature code does not create new shadow values; the tray shadow becomes a shared utility in stage 1.
- The shell and sheet are a shared island surface variant provided by the island shell and `Panel`, so plugin islands opened through the shared panel inherit it.

## Motion vocabulary

Motion explains cause and continuity. Every item uses the public motion tokens and the shared conversation and weave transitions, and respects reduced motion in both Motion and CSS.

| Motion | Meaning | First uses |
| --- | --- | --- |
| Sliding selection indicator (Motion `layoutId`) | Selection moves rather than reappears | Settings navigation, sidebar sessions, segmented controls |
| Directional page change | Order and depth of navigation | Settings categories by navigation order; entering and leaving a single-column page |
| Shared element | The opened thing is the clicked thing | Chosen in stage 2; single-column settings uses directional page motion because its header and sheet clip separately |
| Row presence with height folding | Items join or leave a list | Lists in settings and panels, reusing the drafts box parameters |
| Value transitions | A value changed | Switches, progress, and counts, only on actual change |

Effects that do not map to one of these meanings are out of scope. A static treatment that does not stand on its own is not compensated with more effects.

## Stages

1b. **Design language and lineless content.** Record the design language principles. Replace bordered groups on sheets with tone groups and move conversation process blocks to tone blocks whose lines express only state. Requested by the user after stage 1, who prefers lines that carry meaning over outlines everywhere.

1. **Settings and panel islands.** Add the motion vocabulary to settings navigation and page changes. Move the shared panel island to the shell and sheet variant and promote the tray shadow to a shared utility. Update the design system's surface and motion sections and the surface comment in `styles.css`. Accept with settings and a provider detail open side by side, in wide and single-column layouts.
2. **Home, usage statistics, and sidebar.** Apply the surface rules to their cards and the sliding selection indicator to sidebar and segmented controls.
3. **Menus, popovers, and dialogs.** Decide separately whether these change. They already share the command surface motion definition, have the widest reach, and are portalled outside islands.

## Validation

Each stage runs the necessary typechecks and builds. Visual quality, motion feel, keyboard focus visibility, reduced motion, and high contrast are accepted manually by the user on the actual platform.
