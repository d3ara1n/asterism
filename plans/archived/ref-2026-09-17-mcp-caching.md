# MCP discovery and prompt caching

Archived reference. Research snapshot: 2026-09-17. The material informed the tool-discovery and stable-context design. It records protocol observations and possible experiments, not completed cache measurements. Recheck endpoint support before using it in new work.

## Three different forms of laziness

Delayed server connection, delayed schema retrieval, and delayed model loading are separate mechanisms. Delaying a connection does not itself preserve a model prompt prefix.

The [MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) defines list, call, and change notifications. It does not require sending every tool in a model’s protocol array or promise prompt-cache hits.

## Provider-native discovery

[Anthropic tool search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) described excluding deferred tools from the initial prefix and expanding inline tool references later. Supplying full definitions in a request therefore differs from loading them into the initial model context.

[OpenAI tool search](https://developers.openai.com/api/docs/guides/tools-tool-search) described appending discovered tools to context, including client-executed search. Changing previously loaded results could invalidate cache reuse from that position.

These are provider capabilities, not guarantees for arbitrary compatible proxies or Chat Completions services. Definitions and discovery history still have to remain coherent across requests.

## Fixed dispatch

An application can keep search, inspect, and call entries stable while returning dynamic schemas as ordinary results. It then owns parameter validation and routing.

At the research date Asterism had not selected its MCP implementation. The later module adopted fixed resource entries; this research records the earlier uncertainty.

## Measurement boundaries

Cache eligibility depends on unchanged prefix, retention, routing, and provider behavior. Cache hits do not imply that tool definitions occupy no context.

Compare fixed catalogs, ordinary tool-array growth, native search, and fixed dispatch under matched conditions. Measure input, cached tokens, latency, call correctness, and execution access.

Exercise first discovery, added discovery, unlinking, and changing an old definition separately. A single hit or miss cannot establish a general guarantee. Discovery never substitutes for resource authorization.
