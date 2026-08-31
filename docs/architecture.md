# Architecture

## Design Goal

Breakwater answers one question: **is this analytical-data change safe to publish, and what is the smallest controlled path to do so?**

The architecture separates probabilistic explanation from deterministic policy and side effects.

## Components

### React Operations Console

The Worker serves a responsive React application. Each browser receives a stable random session name stored in local storage, which routes it to an isolated Agent instance. The UI combines chat with schema diff, lineage, evidence, Workflow progress, approval, memory, and audit state.

### Breakwater Agent

`BreakwaterAgent` extends `AIChatAgent<Env, BreakwaterState>`. It owns:

- Llama 4 Scout chat over a WebSocket UI message stream
- Three narrow model tools
- Per-session durable identity
- Typed state synchronized to connected clients
- SQLite tables for policy memory, review history, and audit events
- Workflow creation, approval, rejection, and lifecycle callbacks

The Agent is the real-time coordinator. It does not implement long-running rollout semantics itself.

### Deterministic Review Engine

The review engine is a pure TypeScript module with no model dependency. It currently evaluates:

- Removed contracted columns
- Retained-column physical type changes
- Sensitive-column additions relative to asset access
- Organization-specific wildcard policies
- Failed profile and semantic controls
- Transitive downstream lineage
- Evidence-reference integrity

Every finding has a severity, evidence IDs, affected assets, and remediation. A review is rejected if any finding references evidence that does not exist.

### Workers AI

The chat uses `@cf/meta/llama-4-scout-17b-16e-instruct`, with low temperature, bounded tool steps, pruned history, and session affinity. Review requests force the authoritative evaluation tool before the explanatory step. AI SDK simulated-streaming middleware converts complete Workers AI steps into the UI message stream, avoiding duplicate deltas when a provider response exposes both native and OpenAI-compatible SSE fields. The model may explain tool output and propose next actions, but it cannot directly publish or bypass deterministic controls.

### Rollout Workflow

`RolloutWorkflow` extends `AgentWorkflow` and uses durable, named steps:

1. Snapshot the current contract and dependency graph
2. Stage a remediated candidate with retry policy
3. Re-run controls
4. Pause with `waitForApproval()` for up to seven days
5. Publish atomically with rollback metadata
6. Verify post-publication controls

Workflow progress is sent to the originating Agent, persisted in state, and synchronized to clients. Refreshing or disconnecting does not discard the approval gate.

## State Machine

```text
idle -> analyzing -> blocked | ready
blocked | ready -> deploying -> awaiting_approval
awaiting_approval -> deploying -> verified
awaiting_approval -> rejected
deploying -> failed
```

`blocked` means the submitted change cannot publish as-is. It may still start a remediation rollout because the Workflow stages the recommended corrections and reruns controls before approval.

## Storage Model

Agent state is intentionally small because every state update broadcasts to clients:

- Selected scenario and review status
- Current structured review
- Current Workflow progress
- Small policy-memory list
- Twelve most recent audit events

Historical reviews, full audit records, chat messages, and policy records live in the Agent's colocated SQLite database.

## Trust Boundaries

| Boundary              | Enforcement                                                                    |
| --------------------- | ------------------------------------------------------------------------------ |
| Model to evidence     | Model only receives tool output; findings cite known evidence IDs              |
| Browser to Agent      | Callable inputs are validated, including policy patterns and decision reasons  |
| Memory mutation       | `rememberPolicy` uses an approval-gated model tool                             |
| Agent to publication  | Agent starts a Workflow but cannot skip its validation and approval steps      |
| Approval to action    | Workflow resumes only through `approveWorkflow`; rejection terminates the path |
| Retry to side effects | Named durable Workflow steps prevent completed actions from repeating          |

## Data Safety

The prototype does not execute user-provided SQL. SQL is displayed as context from trusted fixtures, while deterministic controls operate on structured manifests. A production version would parse artifacts produced by a transformation system and execute candidate queries through a restricted Trino or R2 SQL service identity.

## Production Mapping

The domain interfaces deliberately resemble a small catalog adapter. A production implementation would replace fixtures without changing the review contract:

- `DataAsset` from DataHub entities or dbt manifests
- `LineageEdge` from OpenLineage/DataHub
- `ProfileCheck` from Trino/R2 SQL candidate validation
- `ColumnDefinition` classification from a PII scanner
- Workflow publication through Transformer, dbt Cloud, or a GitOps deployment API
- Reviewer identity and role checks from Cloudflare Access
