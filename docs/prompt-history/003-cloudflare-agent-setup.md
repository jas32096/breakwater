# Prompt 003: Cloudflare Agent Setup

**Date:** August 30, 2026  
**Model:** OpenAI `gpt-5.6-sol` through OpenCode

## User Prompt

> Fetch and execute the appropriate instructions to set me up for Cloudflare from https://developers.cloudflare.com/agent-setup/prompt.md

## Outcome

- Fetched and followed Cloudflare's official setup instructions for OpenCode.
- Installed all 13 Cloudflare skills at project scope under `.agents/skills` without a system-wide package installation.
- Recorded exact skill sources and hashes in `skills-lock.json` for reproducible restoration.
- Registered the Cloudflare API, documentation, bindings, builds, and observability MCP servers in the user's existing OpenCode configuration.
- Validated the merged configuration with `opencode debug config`.
- Completed read-only OAuth for the primary Cloudflare API MCP.
- Verified the public documentation MCP connection.
- Left bindings, builds, and observability configured to trigger OAuth on first use, as specified by the official instructions.

OpenCode must be restarted to load the newly registered MCP servers into a running session.
