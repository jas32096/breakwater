# Prompt 002: Implementation

**Date:** August 30, 2026  
**Model:** OpenAI `gpt-5.6-sol` through OpenCode

## User Prompts

> Execute this plan. Do not check in with me, unless you absolutely need to. Do your best to do this on your own.

> Btw, if you're going to be installing stuff on my machine, don't install anything system wide. Use Docker or nix or similar.

> Also make sure you're working in a git project.

> You should be making your changes in git commits. You can take advantage of git, to manage your own history of changes. Use it however will be most useful for you.

## Outcome

- Scaffolded the official Cloudflare Agents starter with project-local npm dependencies.
- Initialized a Git repository on `main`.
- Implemented deterministic contract, governance, quality, lineage, and policy-memory controls.
- Added a streaming Llama 3.3 `AIChatAgent` with three narrow tools.
- Added colocated SQLite review history, memory, and append-only audit records.
- Added a retryable `AgentWorkflow` with durable human approval.
- Replaced the starter chat with a responsive lakehouse operations console.
- Added twelve deterministic tests, CI checks, dependency audit, and deployment dry-run verification.

No dependencies were installed system-wide.
