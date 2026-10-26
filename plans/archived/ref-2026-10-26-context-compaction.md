# Context compaction references

Archived reference collected on 2026-10-26 from existing design material. These sources informed the implemented compaction approach. Moving the record does not constitute a new verification of the linked material.

## Sources retained from the investigation

| Source | Material considered |
| --- | --- |
| [pi compaction](https://github.com/badlogic/pi-mono/blob/47fc5f3/packages/coding-agent/src/core/compaction/compaction.ts) | Incremental summaries, retained recent content, and complete tool boundaries |
| [OpenCode compaction](https://github.com/sst/opencode/blob/34d8ded0c58dd66808c1d60e081e8c66da12a896/packages/core/src/session/compaction.ts) | Structured checkpoints and context-budget information |
| [Codex handoff prompt](https://github.com/openai/codex/blob/400f2356d60c4663d46817a40b4d09c5c86f35ad/codex-rs/prompts/templates/compact/prompt.md) | Goals, progress, decisions, constraints, and continuation material |
| [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Preserving necessary task information while reducing redundant context |

## Results consumed

The design separated original history from request projection, retained recent complete responses and tool results, and used an independent summary prompt. Summary boundaries and generation failures remained explicit.

These are historical inputs, not dependencies of the engineering documentation. A later investigation can reassess the evidence without changing the software's conceptual explanation.
