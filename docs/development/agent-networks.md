# Agent networks

Mesh is a communication resource connecting agents across sessions. Each Mesh belongs to one session and selects a shared channel. Channels have stable internal identities and editable display names. Channel selection and task descriptions are current resource data; timeline navigation reconstructs links without restoring that data.

## Direction and access

Exposing a Mesh to an agent grants use of its supported tools. Exposing an agent to a Mesh adds that agent to the channel's reachable members. The two directions remain independent. Receiving a message neither creates a link nor grants a return route.

The Mesh implementation captures its channel and member references at the model request boundary. Channel switches and membership changes affect subsequent requests. A captured reference still resolves through ordinary agent lifecycle validation: removal or archival can make the target unavailable. Mutable task descriptions are read at handling time from the captured exposure paths.

Channel access does not grant direct access to the target agent's other resources. Mesh resolves targets before invoking public agent input or investigation capabilities. The Agent domain owns message admission, execution, and saved-record investigation.

## Member identity

Internal agent identity deduplicates exposure through multiple Mesh resources. The last exposure path leaving a channel ends membership. Card counts and model listings use the same distinct member set.

Model addressing uses the exact agent title and a numeric disambiguator scoped to the channel and title. Zero is the omitted default. New collisions consume increasing numbers; removal leaves gaps and never renumbers remaining members. When the name has no remaining members, its allocation state is discarded. Renaming an agent moves it into the new title's allocation group. Numbering persists across application restart, but is not permanent identity.

## Profiles and presentation

Agent titles and configured types remain Agent-owned facts. Editable task descriptions belong to a Mesh and agent pair. Switching channels retains those local descriptions; different Mesh resources can describe different tasks for the same agent.

Listings expose each agent once with its numeric ID, title, configured type, and distinct descriptions from the channel's exposure paths. Self-profile queries read only the caller's description on the selected Mesh. A caller with no exposure path has no member ID.

Mesh cards share the channel directory and show deduplicated member counts. Card visibility has no effect on membership. Resource attachment lifetimes and current session links determine which exposure paths exist.
