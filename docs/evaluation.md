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

## Live Model Verification

Run against the production Worker on August 31, 2026:

- The Agent WebSocket connected and synchronized initial state.
- `evaluateChange` reached `output-available` and returned the authoritative blocked decision with three findings.
- The final narrative cited known contract, governance, quality, and lineage evidence IDs.
- The persisted narrative contained no duplicated streaming tokens.
- A Chromium browser retained document scroll position during chat updates.
- Desktop and mobile chat panes scrolled internally while keeping the input contained.
- The chat, rollout, and audit panels did not overlap after document scrolling.

These checks exercise the deployed Llama 4 Scout binding without converting model output into a policy authority. Deterministic tests remain the source of truth for review decisions.
