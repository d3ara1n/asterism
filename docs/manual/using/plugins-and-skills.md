# Use plugins and skills

Plugins add executable capabilities and views. Skills supply instructions and supporting files that a model reads when the task needs them.

## Add a plugin

Open **Settings → Plugins** to add a local package directory. Select the package root containing its `package.json` and Asterism declaration.

The management list shows metadata, loading state, and enablement controls. A plugin's configuration pages appear separately on settings home and identify their contributor. Installation and enablement changes take effect after restarting Asterism.

A startup failure prevents the plugin and its dependents from contributing capabilities. The management list identifies the failing stage and cause. An unavailable interface is a separate condition: accepted background services can remain running even when the interface cannot initialize. Partial interface initialization means some frontend modules failed while the plugin's views remain available.

The bundled builtin plugin provides the official Agent experience and can be disabled like another plugin. Other plugins can supply their own Home entry. Choose among available entries in General settings. If the selected entry becomes unavailable, choose another; resource templates remain accessible independently.

Plugins run as trusted local code. Install packages whose behavior you accept. Removing a plugin from the list does not erase its historical session records or automatically clean its private data.

## Add a skill

Place each skill in its own directory under `~/.agents/skills/`. The package’s `SKILL.md` starts with YAML frontmatter containing a name and description:

```markdown
---
name: review-notes
description: Review a collection of notes for unresolved decisions.
---

Read the relevant notes and identify decisions that need follow-up.
```

Supporting files belong inside the skill package. References to those files resolve from the package directory.

Refresh **Settings → Skills** after adding or changing packages. The page shows raw user and plugin sources, their provenance, discovered skills, and discovery problems. Each Agent paradigm decides which of those contributions enter its requests.

## Read skills during work

Builtin gives the model the names and descriptions selected for its request. User packages override plugin packages with the same name, and plugin packages override builtin packages. `skill_read` reads a selected skill or one of its supporting text files; `skill_refresh` refreshes discovery for later requests. A skill removed by request preparation is unavailable to that request.

A skill describes a method. The resources and tools available to the agent determine which operations it can actually perform.
