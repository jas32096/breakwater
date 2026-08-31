# Prompt 006: Scrolling Repair

**Date:** August 31, 2026  
**Model:** OpenAI `gpt-5.6-sol` through OpenCode

## User Prompt

> [Attached screenshot] Look how the scrolling is broken

## Outcome

- Identified a sticky chat panel overlapping later rollout content as the document scrolled.
- Found that `scrollIntoView()` on every message update also scrolled the document instead of only the chat pane.
- Replaced document-level scrolling with direct scrolling on the bounded message container.
- Removed nested sticky positioning and added correct flex overflow constraints.
- Added long-token wrapping, contained overscroll, and stable scrollbar space.
- Used a temporary Playwright Core and Chromium installation outside the repository for production browser verification.
- Verified desktop internal overflow, stable document position, contained input, and a persistent gap between chat and rollout panels.
- Verified the same bounded chat behavior at a 390-pixel mobile viewport.
- Deployed, committed, pushed, and passed the sanity and Semgrep workflows.
