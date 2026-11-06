# Command palette replacements with native inline controls

Filed: 2026-11-06
Status: Consumed and archived. The user dropped the arbitrary-inline-control requirement and approved migration to the existing cmdk dependency.

## Requirement and scope

The user chose to replace the application command palette because its interaction and selection presentation are unsatisfactory, rather than continue a local theme-styling trial. The hard requirement is native support for independently interactive inline controls: buttons, exclusive choices, switches/checkboxes, editable inputs, and Select/Combobox triggers and popups. Accepting arbitrary JSX is not sufficient evidence of focus and keyboard support.

The application currently uses `react-aria-components` only in `ApplicationCommands.tsx`. Plugin command contributions can supply a control ReactNode and own hooks, feedback, and asynchronous work. The replacement must preserve those capabilities. Builtin's separate Agent palette is not part of this replacement.

This investigation checked official documentation, the official shadcn registry through its CLI, relevant implementation source, and published package metadata/source. It installed no project dependencies, launched no GUI, and performed no keyboard or screen-reader acceptance. Documentation and source evidence do not certify every third-party plugin control.

## Conclusion

No examined ready-made command palette establishes the entire inline-control contract as an out-of-the-box feature. Many shadcn registry examples are presentation layers over the same action-list primitives.

Ariakit is the strongest alternative building-block candidate found: its publicly exported `ToolbarContainer` explicitly supports interactive widgets inside a navigable item, with library-owned entry/exit focus behavior. This is stronger evidence than arbitrary ReactNode children, but it is a native interaction primitive, not an all-in-one command palette. A searchable dialog composed from these primitives is a proposal, not an accepted or verified replacement.

## Candidate assessment

| Candidate | Evidence | Disposition for this requirement |
| --- | --- | --- |
| Ariakit Toolbar and ToolbarContainer | Official docs explicitly describe a container with interactive widgets and show a native input inside. The published implementation manages internal tabbability and entering/leaving descendants. | First candidate for a composed searchable action/control dialog; not a drop-in Command component. |
| Ariakit Dialog + Combobox command-menu examples | Official examples demonstrate searchable action menus, tabs, and grid selection. | Do not assume those examples automatically provide the ToolbarContainer interaction contract. |
| coss Command | Tailwind/shadcn registry workflow; wraps Base UI Dialog and Autocomplete. Command supplies automatic-highlight defaults. | Convenient ready-made action palette, but no additional native arbitrary-inline-control contract was established. |
| Base UI Autocomplete 1.9.0 | Supports `grid` and Row, so it is not limited to a listbox layout. Its shared ComboboxItem implementation still prevents pointer-down/mouse-down defaults to retain input focus. | Grid option navigation is not evidence of independently editable nested controls. Not verified for this replacement. |
| Official shadcn Command / cmdk | Registry source imports cmdk. Inspected cmdk uses listbox/option semantics and root-level Enter/navigation handling. | Not suitable as a direct replacement carrying arbitrary independently interactive controls inside options. |
| kbar | Customizable result rendering and action navigation. | No examined documentation established the complete independent-control contract. |
| react-cmdk | List items are action/link components; children customization is not a nested-control interaction contract. | Not established. |
| react-command-palette | Custom command/suggestion rendering over an action-oriented suggestion interface. | Not established. |
| Easy Shadcn, DesignRevision, and similar cmdk-based registry palettes | Add assembly, styling, nested command pages, or action metadata to shadcn/cmdk. | More visual examples do not supply a different inline interaction model. |

The W3C listbox pattern explicitly states that options do not provide an accessible interaction model for nested buttons, links, and checkboxes. Grid and toolbar are alternative interaction patterns; neither label alone proves a library supports arbitrary child widgets.

## Ariakit evidence and boundary

The registry metadata reports `@ariakit/react` 0.4.42, MIT licensed, with React and React DOM 19 included in its peer ranges. Its published dependency is `@ariakit/react-components` 0.7.1. This is declared compatibility, not runtime validation against the project's exact React version.

The published `@ariakit/react` toolbar entry exports `ToolbarContainer`. The inspected published implementation beneath it:

- Disables inactive internal tab stops and restores them when entering a container.
- Focuses the first tabbable descendant on a keyboard-generated activation.
- Recognizes direct focus on a descendant, including pointer interaction.
- Handles return toward the container on Escape and on Enter from editable targets.
- Contains IME composition guards.

These are library-owned mechanisms, not event workarounds the application would have to invent. Native support here means a supported interaction mechanism, not unchanged native keyboard behavior: the published handler prevents default on unmodified Enter from input, textarea, and contenteditable targets and returns focus to the container. That may conflict with multiline editing or a widget's own Enter behavior. Its descendant Escape handler schedules container focus without itself preventing default or stopping propagation, so it does not establish a first-Escape-exits/second-Escape-closes dialog contract. Composition with outer dialog dismissal, nested portal popups, and dynamically changing controls still requires evaluation.

The lower-level CompositeContainer appears in the implementation package but is not exported by the inspected public `@ariakit/react/composite` entry. Prefer the documented public ToolbarContainer route; do not build an application dependency on an internal path merely because source is available.

Ariakit also documents a Toolbar with its own Select/Combobox composition and integration of its Combobox with Radix primitives. Neither example certifies arbitrary Radix plugin popups within the proposed searchable dialog.

## Proposed direction, not a decision

One candidate composition is a dialog with search/filtering, action items, and native inline-control containers styled with the existing shadcn tokens. It would use focus/activation rather than representing every result as a selected option. Search and command contribution assembly remain application responsibilities.

This direction changes the interaction model. It must explain how users move from search to results, enter a row's controls, move between those controls, and return or dismiss nested surfaces. A container-based navigation/editing mode may itself feel undesirable to the user; native support does not imply preferred usability.

A simpler alternative is a searchable shadcn Dialog containing ordinary actions and form controls, using normal Tab navigation and no composite result selection. It has native control semantics but is not a ready-made command-palette library and does not automatically supply arrow-key result navigation. That is a separate product choice, not a silent fallback.

Before choosing a dependency or migrating, evaluate a minimal surface containing an action button, the theme choice, a switch, a text field, and a Select/Combobox popup. The purpose is to resolve composition and interaction questions, not to claim universal compatibility or replace user acceptance with automated UI tests.

## Sources

- [Ariakit ToolbarContainer](https://ariakit.com/reference/toolbar-container)
- [Ariakit Toolbar](https://ariakit.com/components/toolbar)
- [Ariakit Toolbar with Select](https://ariakit.com/examples/toolbar-select)
- [Ariakit composition](https://ariakit.com/guide/composition)
- [Ariakit Radix Combobox](https://ariakit.com/examples/combobox-radix)
- [Ariakit command-menu example](https://ariakit.com/examples/dialog-combobox-command-menu)
- [Ariakit package metadata](https://registry.npmjs.org/@ariakit/react/0.4.42) and [published implementation package](https://registry.npmjs.org/@ariakit/react-components/0.7.1)
- [Toolbar container implementation](https://github.com/ariakit/ariakit/blob/main/packages/ariakit-react-components/src/toolbar/toolbar-container.tsx) and [composite container implementation](https://github.com/ariakit/ariakit/blob/main/packages/ariakit-react-components/src/composite/composite-container.tsx); published package source was checked as well as main.
- [Base UI Autocomplete](https://base-ui.com/react/components/autocomplete)
- [Base UI 1.9.0 shared item source](https://github.com/mui/base-ui/blob/v1.9.0/packages/react/src/combobox/item/ComboboxItem.tsx)
- [coss Command](https://coss.com/ui/docs/components/command)
- [Official shadcn Command](https://ui.shadcn.com/docs/components/radix/command)
- [cmdk source](https://github.com/dip/cmdk/blob/main/cmdk/src/index.tsx)
- [kbar](https://github.com/timc1/kbar), [react-cmdk](https://github.com/albingroen/react-cmdk), and [react-command-palette](https://github.com/asabaylus/react-command-palette)
- [Easy Shadcn palette](https://easy-shadcn.vercel.app/docs/components/command-palette) and [DesignRevision Command](https://registry.designrevision.com/components/command)
- [W3C listbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/) and [toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/)

## Disposition

The user reviewed the alternatives, removed the hard requirement to host arbitrary interactive controls, and selected cmdk with nested command pages and relevance sorting. The approved scope preserves automatic session naming as an asynchronous action and software updates as an action with read-only status/progress. Theme selection moves to a nested list with an explicit saved-choice marker. No Ariakit or other new dependency was introduced.

The strict-inline-control comparison above remains historical research, not a claim that the approved cmdk implementation supports that discarded requirement. Implementation validation and pending manual acceptance are recorded in the active GUI follow-up plan.
