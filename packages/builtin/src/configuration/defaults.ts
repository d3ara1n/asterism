import type { AgentConfiguration, ModelRole } from "@asterism-app/builtin-api/contracts";
import { defaultAgentPreset } from "@asterism-app/builtin-api/contracts";

// Built-in agents supply purpose-specific defaults used as the original resolution baseline.
export const defaultAgents: AgentConfiguration[] = [
  {
    "id": defaultAgentPreset,
    "delegates": ["explorer", "researcher", "advisor"],
    "resources": null,
    "excludeResources": null,
    "builtin": true,
    "enabled": true,
    "description": "Implementation of features, fixes, refactors, and content changes.",
    "systemPrompt": "Implementation worker. Implement features, fixes, refactors, and content changes within the requested scope.",
    "modelRole": "default",
    "examples": [
      "Rename all snake_case fields to camelCase",
      "Add input validation to POST /login"
    ],
    "subagent": {
      "instructions": [
        "Work autonomously on the delegated task using its supplied context.",
        "Return a concise report:",
        "## Changes: list each file touched and what changed",
        "## Verification: checks performed and remaining verification gaps",
      ].join("\n"),
      "budget": { "maxRequests": 4096, "maxDurationSeconds": 2400 }
    }
  },
  {
    "id": "explorer",
    "delegates": [],
    "resources": null,
    "excludeResources": null,
    "builtin": true,
    "enabled": true,
    "description": "Codebase exploration: file locations, symbols, dependencies, structure, and change history.",
    "systemPrompt": [
      "Code explorer. Provide read-only investigation of file locations, symbols, dependencies, structure, and change history.",
      "Findings include relevant source locations.",
    ].join("\n"),
    "modelRole": "fast",
    "examples": [
      "Find where auth middleware is implemented",
      "Map the routing structure",
      "Summarize what the uncommitted diff changes, file by file"
    ],
    "subagent": {
      "instructions": [
        "Provide the caller with factual findings for the delegated investigation; the caller owns subsequent design and implementation decisions.",
        "Return a report in this format:",
        "## Files: file paths with line ranges and one-line descriptions",
        "## Findings: key types/functions with short code snippets",
        "## Summary: direct answer to the task question",
      ].join("\n"),
      "budget": { "maxRequests": 4096, "maxDurationSeconds": 900 }
    }
  },
  {
    "id": "reviewer",
    "delegates": ["explorer", "researcher"],
    "resources": null,
    "excludeResources": null,
    "builtin": true,
    "enabled": true,
    "description": "Code review and analysis of correctness, security, performance, and maintainability.",
    "systemPrompt": [
      "Senior code reviewer. Provide read-only analysis of correctness, security, performance, and maintainability, with suggested fixes.",
      "Provide evidence-backed findings with file:line references.",
    ].join("\n"),
    "modelRole": "heavy",
    "examples": [
      "Review the error handling in src/api/ for security issues",
      "Audit this PR diff for performance regressions"
    ],
    "subagent": {
      "instructions": [
        "The delegated deliverable is a review with suggested fixes. The caller owns implementation.",
        "Return a report with critical issues first:",
        "## Issues: severity + file:line + description + suggested fix",
        "## Observations: notable patterns or design concerns",
        "## Summary: overall assessment in 1-2 sentences",
      ].join("\n"),
      "budget": { "maxRequests": 4096, "maxDurationSeconds": 3600 }
    }
  },
  {
    "id": "researcher",
    "delegates": ["explorer"],
    "resources": null,
    "excludeResources": null,
    "builtin": true,
    "enabled": true,
    "description": "Research into documentation, external sources, and repositories, with source citations.",
    "systemPrompt": [
      "Researcher. Investigate documentation, external sources, and repositories.",
      "Provide verified facts and sources, with explicit gaps and uncertainty.",
      "Research leaves project source files unchanged.",
    ].join("\n"),
    "modelRole": "fast",
    "examples": [
      "Find the React 19 migration guide",
      "Check GitHub issue #1234 for context"
    ],
    "subagent": {
      "instructions": [
        "The delegated deliverable is verified facts and sources. The caller weighs the findings and makes solution and design decisions.",
        "Return a report in this format:",
        "## Answer: direct answer to the question (2-3 sentences)",
        "## Sources: list of URLs used",
        "## Gaps: what could not be answered",
      ].join("\n"),
      "budget": { "maxRequests": 4096, "maxDurationSeconds": 2400 }
    }
  },
  {
    "id": "advisor",
    "delegates": ["explorer", "researcher"],
    "resources": null,
    "excludeResources": null,
    "builtin": true,
    "enabled": true,
    "description": "Advice on architecture, design, and migration decisions, including tradeoffs and risks.",
    "systemPrompt": [
      "Expert advisor. Give well-grounded advice on architecture, design, and migration decisions.",
      "Your role is analysis and recommendation; leave the files you inspect unchanged.",
      "Distinguish verified findings from assumptions and identify missing evidence that could change the recommendation.",
    ].join("\n"),
    "modelRole": "smart",
    "examples": [
      "Which module boundary fits this codebase — separate package or shared core?",
      "Review this migration plan against the actual code — what are the risks?",
      "Compare two API designs for the new service using the current call sites"
    ],
    "subagent": {
      "instructions": [
        "The delegated deliverable is advice for the caller's decision. The caller owns implementation.",
        "Return a report in this format:",
        "## Context: what you found that shapes the decision, with file:line evidence",
        "## Options: concrete viable options with tradeoffs",
        "## Recommendation: which option and why, plus risks and next steps",
      ].join("\n"),
      "budget": { "maxRequests": 4096, "maxDurationSeconds": 3600 }
    }
  }
];

export const defaultRoles: ModelRole[] = [
  {
    "id": "default",
    "builtin": true,
    "enabled": true,
    "model": null,
    "thinking": "medium",
    "description": "General development tasks: writing new features, modifying existing code, code review, adding tests, routine debugging, file-level changes",
    "hidden": false
  },
  {
    "id": "heavy",
    "builtin": true,
    "enabled": true,
    "model": null,
    "thinking": "high",
    "description": "Tasks requiring deep thinking: cross-file refactoring, architecture design, complex bug debugging, performance optimization, security analysis, database schema changes, multi-module migrations",
    "hidden": false
  },
  {
    "id": "fast",
    "builtin": true,
    "enabled": true,
    "model": null,
    "thinking": "low",
    "description": "Simple deterministic tasks: one-line edits, formatting tweaks, simple Q&A, doc lookups, git operations, confirmation replies",
    "hidden": false
  },
  {
    "id": "utility",
    "builtin": true,
    "enabled": true,
    "model": null,
    "thinking": "off",
    "description": "Lightweight utilities: model routing, commit generation, title/summary, etc. (hidden)",
    "hidden": true
  },
  {
    "id": "smart",
    "builtin": true,
    "enabled": true,
    "model": null,
    "thinking": "high",
    "description": "Expert judgment, architectural advice, and decisions grounded in evidence.",
    "hidden": false
  }
];
