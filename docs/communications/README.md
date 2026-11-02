# Project Communications & Handover

This folder is the continuity record for Jerico. Any developer, AI coding agent, or new ChatGPT conversation should read these documents before continuing substantial work.

## Read in this order

1. [Current state](./CURRENT-STATE.md) — what the project is, where implementation stands, and the next action.
2. [Decision log](./DECISION-LOG.md) — decisions that should not be casually revisited.
3. [Session log](./SESSION-LOG.md) — chronological summaries of significant work sessions.
4. [Architecture](../architecture/README.md) — technical design.
5. [Implementation roadmap](../roadmap/implementation-plan.md) — phased tasks and acceptance criteria.

## Update protocol

At the end of every substantial development or planning session:

- Update `CURRENT-STATE.md` with the latest verified state and next concrete action.
- Append a dated entry to `SESSION-LOG.md` summarizing what was discussed, changed, tested, committed, and left unresolved.
- Update `DECISION-LOG.md` only when a decision is made, changed, or superseded.
- Update the architecture and roadmap when implementation changes the agreed design or scope.
- Link relevant PRs, commits, issues, and files.
- Distinguish **implemented**, **in progress**, **planned**, and **blocked**. Never describe planned work as completed.
- If the session did not inspect or verify something, say so explicitly.

## What belongs here

Keep durable project context, engineering decisions, handovers, important user instructions, implementation progress, unresolved questions, and links to work.

Do not copy entire chat transcripts by default. Write concise, useful summaries that preserve decisions and context. Do not store credentials, API keys, personal secrets, customer data, or raw production telemetry here.

## Instructions for AI agents

Before making changes:
1. Read this folder, the architecture, and the roadmap.
2. Inspect the actual repository state; documentation may be stale.
3. Treat explicit user decisions as authoritative unless the user changes them.
4. Report discrepancies between documentation and code.
5. Do not claim a task is complete without inspecting the implementation and running relevant checks.

Before finishing:
1. Update the handover and session log.
2. Record exact files, commits, PRs, test results, and remaining work.
3. Leave one clear next step.

This folder is a living project memory, not a substitute for code, tests, Git history, or issue tracking.
