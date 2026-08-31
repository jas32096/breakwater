# Prompt 001: Product Planning

**Date:** August 30, 2026  
**Model:** OpenAI `gpt-5.6-sol` through OpenCode

## User Prompt

> We're building the optional assignment for this job https://job-boards.greenhouse.io/cloudflare/jobs/8102350?gh_jid=8102350
>
> Optional Assignment: Please share GitHub repo URL for the project here
>
> We plan to fast track candidates who complete an assignment to build a type of AI-powered application on Cloudflare. An AI-powered application should include the following components:
>
> - LLM (recommend using Llama 3.3 on Workers AI), or an external LLM of your choice
> - Workflow / coordination (recommend using Workflows, Workers or Durable Objects)
> - User input via chat or voice (recommend using Pages or Realtime)
> - Memory or state
>
> Find additional documentation here: https://developers.cloudflare.com/agents/.
>
> Note: AI-assisted coding is encouraged, but you have to submit prompt history.
>
> Come up with a plan for what to build and submit to win an interview.

## Follow-Up Answers

> Build time: 3-5 days.
>
> Cloudflare access: I just created a free account with GitHub SSO.
>
> Demo emphasis: Data architecture.

## Outcome

The planning pass reviewed the job description, Town Lake/Skipper architecture post, Agents SDK, Workers AI, Durable Object state, Workflows approvals, R2 Data Catalog, and R2 SQL documentation. It selected Breakwater, a lakehouse change-control agent, over a generic NL-to-SQL assistant.

The plan established four design constraints:

- Deterministic evidence remains authoritative.
- Llama 3.3 explains and coordinates but cannot publish directly.
- Durable Workflow approval gates publication.
- Memory stores explicit typed organization policy, not arbitrary transcript summaries.
