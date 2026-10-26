# Use plugins and skills

Plugins add executable capabilities and views. Skills supply instructions and supporting files that a model reads when the task needs them.

## Add a plugin

Open **Settings** and use the plugin section to add a local package directory. Select the package root containing its `package.json` and Asterism declaration.

Plugin cards show metadata, loading state, and management actions. Open a card for its settings when the plugin supplies a settings page. Installation and enablement changes take effect after restarting Asterism.

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

Refresh the skill catalog in the built-in plugin’s settings after adding or changing packages. That view shows discovered skills and discovery problems.

## Read skills during work

The model receives names and descriptions in its skill catalog. `skill_read` reads a selected skill or one of its supporting text files; `skill_refresh` refreshes discovery.

A skill describes a method. The resources and tools available to the agent determine which operations it can actually perform.
