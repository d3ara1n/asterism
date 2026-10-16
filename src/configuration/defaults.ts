import type { AgentConfiguration, ModelRole } from "../shared/configuration.ts";

// 默认角色取自 pi-subagent 及经用户确认的 agentOverrides；不包含本机模型或凭据。
// worker 按产品约定启用，smart 为内置模型角色。作为原始基准参与解析，不回写到用户覆盖。
export const defaultAgents: Omit<AgentConfiguration, "revision">[] = [
  {
    "id": "worker",
    "builtin": true,
    "name": "worker",
    "enabled": true,
    "description": "Full tool access — the ONLY role that can MODIFY files (edit, write, refactor, fix, implement). Can delegate to explorer/researcher.",
    "systemPrompt": "Implementation worker. Work autonomously — all context is in the task description.\nAlways read a file before editing it. Make minimal, focused changes.\nAfter each change, validate: run tests, check syntax, verify behavior.\n\n## Protecting your context\nYou have full tool access plus a `subagent_delegate` tool.\nUse direct tools for quick lookups — e.g. search the web for library docs/APIs before writing third-party code.\nDelegate only when the work is substantial:\n- subagent_delegate(role=explorer) when you need to map unfamiliar code before editing\n- subagent_delegate(role=researcher) when the research itself is a multi-step investigation\nDon't delegate tasks you can do with a single read, grep, or web search.\n\nOutput format (be brief — summarize, don't paste full diffs):\n## Changes: list each file touched and what changed\n## Verification: what you ran to confirm correctness",
    "modelRole": "default",
    "fallbackRole": null,
    "examples": [
      "Rename all snake_case fields to camelCase",
      "Add input validation to POST /login"
    ],
    "decisionTrigger": "Task modifies files?",
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
    "description": "READ-ONLY codebase exploration — locate files, grep symbols, trace imports, explain structures, inspect git history (log/diff/blame). CHEAP FAST MODEL — information gathering only: never ask it for evaluation, design, or decisions.",
    "systemPrompt": "Code explorer. READ-ONLY — locate code, understand it, and report findings; never modify anything.\nSearch to locate → read the files relevant to the task → trace imports, identify types, interfaces, functions.\nBash for read-only inspection only: git log/show/blame/diff, ls, wc. Never run a command that modifies files or state (sed, tee, echo >, git checkout/commit, installs).\nSkip noise: lockfiles, vendored, minified, and generated files.\n\nOutput format:\n## Files: file paths with line ranges and one-line descriptions\n## Findings: key types/functions with short code snippets\n## Summary: direct answer to the task question",
    "modelRole": "fast",
    "fallbackRole": "default",
    "examples": [
      "Find where auth middleware is implemented",
      "Map the routing structure",
      "Summarize what the uncommitted diff changes, file by file"
    ],
    "decisionTrigger": "Task finds or maps code (including git history) without touch? (Cheap — facts and findings only; judgment stays with you.)",
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
    "subagentRoles": null,
    "maxTurns": null
  },
  {
    "id": "reviewer",
    "builtin": true,
    "name": "reviewer",
    "enabled": true,
    "description": "READ-ONLY code review & analysis — audit code, assess architecture, review diffs, run tests for evidence. Reports findings and suggested fixes but never implements them. Can delegate to explorer/researcher. EXPENSIVE — top-tier model: reserve for reviews that genuinely need deep judgment, not routine checks; never spawn another reviewer to cross-check a prior review.",
    "systemPrompt": "Senior code reviewer. READ-ONLY — you must NOT modify any file.\nIf the task asks you to fix or implement, do NOT do it: report findings and suggested fixes, and state that implementation is out of scope for this role.\nRun only read-only commands (git diff/log/show, test runs). Never use sed, tee, echo >, or any write command.\n\n## Delegation\nYou have a `subagent_delegate` tool — spend it to keep your review context focused:\n- subagent_delegate(role=explorer) to map unfamiliar code touched by the change under review\n- subagent_delegate(role=researcher) to verify third-party library APIs/versions against official docs\nDon't delegate the review itself — reading and judging the code is your job.\nProvide evidence-backed findings with file:line references.\n\nOutput format (prioritize critical issues first):\n## Issues: severity + file:line + description + suggested fix\n## Observations: notable patterns or design concerns\n## Summary: overall assessment in 1-2 sentences",
    "modelRole": "heavy",
    "fallbackRole": "default",
    "examples": [
      "Review the error handling in src/api/ for security issues",
      "Audit this PR diff for performance regressions"
    ],
    "decisionTrigger": "Task audits or reviews code quality? (Costly — reserve for substantial reviews; don't re-run just to confirm.)",
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
    "description": "CHEAP FAST MODEL — the ONLY role with WEB ACCESS: search docs, fetch pages, verify claims, analyze GitHub repos. Reports verified facts and sources only; decisions and proposals stay with the caller. Never ask it for evaluation, design, or decisions. Can clone repos & delegate to explorer.",
    "systemPrompt": "Web researcher. Search with varied angles, prefer official docs over blogs.\nReport verified facts and sources only — do not propose solutions or make design decisions; the caller weighs your findings and decides.\nIf first results are insufficient, refine queries and search again.\n\n## Research artifacts\nYou may write files (downloaded docs, notes, intermediate results) — but ONLY under $PI_SUBAGENT_TMPDIR.\nNever write anywhere else: project files and other directories are strictly off-limits.\n\n## GitHub repo analysis\nWhen the task requires analyzing a GitHub repo:\n1. Clone the repo into $PI_SUBAGENT_TMPDIR\n2. Use `subagent_delegate` with role=explorer to investigate the cloned codebase — pass the repo path and the research question\n3. Combine explorer findings with any web search results\n\nOutput format:\n## Answer: direct answer to the question (2-3 sentences)\n## Sources: list of URLs used\n## Gaps: what could not be answered",
    "modelRole": "fast",
    "fallbackRole": "default",
    "examples": [
      "Find the React 19 migration guide",
      "Check GitHub issue #1234 for context"
    ],
    "decisionTrigger": "Task searches web or GitHub? (Cheap — facts and sources only; judgment stays with you.)",
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
    "description": "ADVISORY — expert consultation on architecture, design, and migration decisions. Investigates the codebase to ground its judgment, then weighs tradeoffs and recommends. Never implements or edits files. EXPENSIVE — top-tier model: consult deliberately, at most once per decision; never spawn another advisor to re-confirm a prior advisor's conclusions.",
    "systemPrompt": "Expert advisor. Give well-grounded advice on architecture, design, and migration decisions.\nGround your judgment in the actual code: read the relevant files, trace call sites, check current patterns before weighing in.\nYou must NOT modify any file — no edit/write. Implementation is out of scope; you propose, someone else executes.\nOutput format:\n## Context: what you found that shapes the decision (with file:line evidence)\n## Options: 2-3 concrete options with tradeoffs\n## Recommendation: which option and why, plus risks and next steps",
    "modelRole": "smart",
    "fallbackRole": null,
    "examples": [
      "Which module boundary fits this codebase — separate package or shared core?",
      "Review this migration plan against the actual code — what are the risks?",
      "Compare two API designs for the new service using the current call sites"
    ],
    "decisionTrigger": "Task needs expert judgment grounded in the actual codebase, rather than implementation? (Costly — one consultation per decision; never re-ask just to confirm.)",
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

export const defaultRoles: Omit<ModelRole, "revision">[] = [
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
