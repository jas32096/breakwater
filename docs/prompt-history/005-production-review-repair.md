# Prompt 005: Production Review Repair

**Date:** August 31, 2026  
**Model:** OpenAI `gpt-5.6-sol` through OpenCode

## User Prompts

> Looks broken

> Looks broken [attached screenshot showing repeated `evaluateChange did not complete` tool errors]

> If it helps, use playwright to test or other ways of controlling the browser

## Outcome

- Reproduced the production chat request directly over the Agent WebSocket.
- Confirmed that the deterministic `analyzeScenario` RPC and review engine were healthy.
- Traced the tool failure to model-generated empty arguments bypassing the Zod default.
- Bound catalog inspection and evaluation to the authoritative active server scenario instead of model-controlled IDs.
- Detected a second defect during verification: duplicate prose tokens from dual native and OpenAI-compatible Workers AI SSE fields.
- Switched to Llama 4 Scout and used AI SDK simulated-streaming middleware to preserve UI streaming without duplicate provider deltas.
- Forced review requests through `evaluateChange` before the explanatory model step.
- Rotated the browser session key once to discard persisted broken demo threads.
- Verified a successful blocked review with three findings, valid evidence citations, and clean prose in production.
- Deployed, committed, pushed, and passed the sanity and Semgrep workflows.
