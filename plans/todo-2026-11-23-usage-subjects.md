# Usage subjects beyond skills

Usage subjects landed with skill usage: top-level tools declare through their call context, and model requests declare through their request identity. The host records the declaring plugin, session, request, and call from context. The items below were deliberately left for later.

## Resource tool declarations

Resource tool implementations (`implementTool`) have no `recordUsage` in their call context. The dispatcher already passes a declaration sink to every invocation, so adding it touches only the SDK adapter and the context type. Add it when a resource tool has a fact worth declaring, for example an MCP server and tool identity or a web provider behind a resource call.

## Candidate subject kinds

- MCP servers and their tools, declared by the MCP resource for each call.
- Subagent roles chosen through delegation, declared by the pool tool.
- Plugin instruction blocks projected into requests, declared as `context` with their characters, beside the skill catalog.

Each kind needs a host meaning before a view presents it. Until then it appears only in raw subject queries.

## Agent message references

References inside Agent messages (Mesh and direct sends) are not declared. Declaring them requires a relation that keeps them apart from user references, so that model-chosen reads stay measured against user intent.

## Host-level audit

Records stay attributable through request context, and plugin-owned logs such as the subagent audit cover the remaining detail. A host-observed record of every service access (catalog reads, shell, MCP, web), independent of plugin declarations, is an open product decision. It would bind host services per call rather than per plugin. Decide it on its own merits, not as a side effect of a statistics feature.
