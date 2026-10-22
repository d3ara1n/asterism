import type { AgentConfiguration, ModelRole } from "../shared/configuration.ts";

// 内置代理按用途提供默认配置，作为原始基准参与解析。
export const defaultAgents: AgentConfiguration[] = [
  {
    "id": "worker",
    "builtin": true,
    "name": "worker",
    "enabled": true,
    "description": "Implementation of features, fixes, refactors, and content changes.",
    "systemPrompt": "Implementation worker. The task deliverable is the requested change, with a concise account of the changes and verification evidence.",
    "modelRole": "default",
    "fallbackRole": null,
    "examples": [
      "Rename all snake_case fields to camelCase",
      "Add input validation to POST /login"
    ],
    "tools": null,
    "excludeTools": null,
    "subagentRoles": [
      "explorer",
      "researcher"
    ],
    "maxTurns": null
  },
  {
    "id": "explorer",
    "builtin": true,
    "name": "explorer",
    "enabled": true,
    "description": "Codebase exploration: file locations, symbols, dependencies, structure, and change history.",
    "systemPrompt": "Code explorer. The task deliverable is a factual report of relevant files, symbols, relationships, and history, with source locations.",
    "modelRole": "fast",
    "fallbackRole": "default",
    "examples": [
      "Find where auth middleware is implemented",
      "Map the routing structure",
      "Summarize what the uncommitted diff changes, file by file"
    ],
    "tools": [
      "read",
      "find",
      "grep",
      "list",
      "fffind",
      "ffgrep",
      "bash"
    ],
    "excludeTools": null,
    "subagentRoles": [],
    "maxTurns": null
  },
  {
    "id": "reviewer",
    "builtin": true,
    "name": "reviewer",
    "enabled": true,
    "description": "Code review and analysis of correctness, security, performance, and maintainability.",
    "systemPrompt": "Code reviewer. The task deliverable is a review with evidence, severity, source locations, and suggested fixes for each finding.",
    "modelRole": "heavy",
    "fallbackRole": "default",
    "examples": [
      "Review the error handling in src/api/ for security issues",
      "Audit this PR diff for performance regressions"
    ],
    "tools": [
      "read",
      "bash",
      "grep",
      "find",
      "fffind",
      "ffgrep"
    ],
    "excludeTools": null,
    "subagentRoles": [
      "explorer",
      "researcher"
    ],
    "maxTurns": null
  },
  {
    "id": "researcher",
    "builtin": true,
    "name": "researcher",
    "enabled": true,
    "description": "Research into documentation, external sources, and repositories, with source citations.",
    "systemPrompt": "Researcher. The task deliverable is a report of verified facts and sources, with explicit gaps and uncertainty.",
    "modelRole": "fast",
    "fallbackRole": "default",
    "examples": [
      "Find the React 19 migration guide",
      "Check GitHub issue #1234 for context"
    ],
    "tools": [
      "web_search",
      "fetch_content",
      "source_check",
      "get_search_content",
      "read",
      "bash",
      "edit",
      "write",
      "subagent_delegate",
      "fffind",
      "ffgrep"
    ],
    "excludeTools": null,
    "subagentRoles": [
      "explorer"
    ],
    "maxTurns": null
  },
  {
    "id": "advisor",
    "builtin": true,
    "name": "advisor",
    "enabled": true,
    "description": "Advice on architecture, design, and migration decisions, including tradeoffs and risks.",
    "systemPrompt": "Expert advisor. The task deliverable is a recommendation grounded in the available evidence, with alternatives, tradeoffs, risks, and supporting source locations.",
    "modelRole": "smart",
    "fallbackRole": null,
    "examples": [
      "Which module boundary fits this codebase — separate package or shared core?",
      "Review this migration plan against the actual code — what are the risks?",
      "Compare two API designs for the new service using the current call sites"
    ],
    "tools": [
      "read",
      "bash",
      "grep",
      "find",
      "list",
      "fffind",
      "ffgrep",
      "subagent_delegate"
    ],
    "excludeTools": null,
    "subagentRoles": [
      "explorer",
      "researcher"
    ],
    "maxTurns": null
  }
];

export const defaultRoles: ModelRole[] = [
  {
    "id": "default",
    "builtin": true,
    "name": "default",
    "enabled": true,
    "model": null,
    "thinking": "medium",
    "description": "General development tasks: writing new features, modifying existing code, code review, adding tests, routine debugging, file-level changes",
    "hidden": false
  },
  {
    "id": "heavy",
    "builtin": true,
    "name": "heavy",
    "enabled": true,
    "model": null,
    "thinking": "high",
    "description": "Tasks requiring deep thinking: cross-file refactoring, architecture design, complex bug debugging, performance optimization, security analysis, database schema changes, multi-module migrations",
    "hidden": false
  },
  {
    "id": "fast",
    "builtin": true,
    "name": "fast",
    "enabled": true,
    "model": null,
    "thinking": "low",
    "description": "Simple deterministic tasks: one-line edits, formatting tweaks, simple Q&A, doc lookups, git operations, confirmation replies",
    "hidden": false
  },
  {
    "id": "utility",
    "builtin": true,
    "name": "utility",
    "enabled": true,
    "model": null,
    "thinking": "off",
    "description": "Lightweight utilities: model routing, commit generation, title/summary, etc. (hidden)",
    "hidden": true
  },
  {
    "id": "smart",
    "builtin": true,
    "name": "smart",
    "enabled": true,
    "model": null,
    "thinking": "high",
    "description": "Expert judgment, architectural advice, and decisions grounded in evidence.",
    "hidden": false
  }
];
