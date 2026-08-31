# Evaluation

## Objective

The evaluation asks whether Breakwater reliably finds deterministic data-platform risks before the LLM explains them. It does not score prose style.

## Current Results

Run on August 30, 2026:

```text
Test files: 2 passed
Tests:      12 passed
```

Command:

```bash
npm test
```

## Golden Cases

| Case                            | Expected behavior                          |
| ------------------------------- | ------------------------------------------ |
| Safe additive internal column   | Ready, no false blocker                    |
| Contracted column removed       | Blocker                                    |
| Retained column type changed    | Warning                                    |
| PII added to broad asset        | Blocker                                    |
| PII added to restricted asset   | Warning, not blocker                       |
| Aggregate reconciliation failed | Blocker                                    |
| Transitive lineage              | All downstream assets returned once        |
| Learned `*_token` policy        | Previously safe export becomes blocked     |
| Evidence integrity              | Unknown evidence ID invalidates review     |
| Billing hero scenario           | Contract, governance, and quality findings |

The remaining tests cover wildcard behavior and authoritative evidence linkage across the hero scenario.

## Reliability Strategy

- Pure review functions accept a scenario, memory set, and clock.
- The model is excluded from policy decisions.
- Evidence identifiers make unsupported claims detectable.
- The safe additive case protects against a system that blocks every change.
- Fixed timestamps keep serialized review tests deterministic.

## Model Evaluation Gap

The live model narrative still needs a small recorded evaluation after Cloudflare deployment. The proposed checks are:

- Every concrete risk statement includes a valid evidence ID.
- No response claims publication before Workflow completion.
- A simple review completes within six tool steps.
- The model does not call `rememberPolicy` without an explicit user instruction.
- A rejected memory tool call leaves policy state unchanged.

These should be run against the deployed Llama 3.3 binding and recorded without converting model output into a policy authority.
