# Course-tutor model policy

This repository uses a usage-conscious default for slide teaching:

- **Default:** `gpt-5.6-luna`, Medium reasoning, Standard speed.
- **Simple slides:** use lighter reasoning when available (titles, agendas, recaps, and straightforward definitions).
- **Escalation:** use Terra or Sol only for unusually difficult slides, such as dense derivations, ambiguous diagrams, multi-step code traces, conflicting sources, or persistent misconceptions.
- **Routine teaching:** do not use Fast mode, Ultra, Max, or high reasoning.

## Updating the default

When a new model becomes available, test it on several representative slides, then update these locations:

1. `.codex/config.toml` — the actual project default.
2. `skills/course-tutor/SKILL.md` — the canonical operational policy.
3. `skills/course-tutor/references/teaching-protocol.md` — the canonical human-readable teaching contract.
4. Run `npm run install:skill` to update `.agents/skills/course-tutor/` when that directory is writable.

Keep the model policy centralized here and in the canonical skill. Do not copy model names into individual slide notes. An explicit model choice by the user always takes precedence over the project default.

The project configuration applies to trusted local Codex workspaces. Availability and usage limits depend on the account, client, and model rollout.
