# Course-tutor model policy

This repository uses a usage-conscious default for slide teaching:

- **Default:** `gpt-5.6-luna`, Medium reasoning, Standard speed.
- **Simple slides:** use lighter reasoning when available (titles, agendas, recaps, and straightforward definitions).
- **Escalation:** use Terra or Sol only for unusually difficult slides, such as dense derivations, ambiguous diagrams, multi-step code traces, conflicting sources, or persistent misconceptions.
- **Routine teaching:** do not use Fast mode, Ultra, Max, or high reasoning.

## Updating the default

When a new model becomes available, test it on several representative slides, then update these locations:

1. `.codex/config.toml` — the actual project default.
2. `.agents/skills/course-tutor/SKILL.md` — the operational policy Codex follows.
3. `.agents/skills/course-tutor/references/teaching-protocol.md` — the human-readable teaching contract.

Keep the model policy centralized here and in those three locations. Do not copy model names into individual slide notes. An explicit model choice by the user always takes precedence over the project default.

The project configuration applies to trusted local Codex workspaces. Availability and usage limits depend on the account, client, and model rollout.
