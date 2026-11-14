# Agent Operating Guidelines

This repository follows engineering guidelines documented across `GEMINI.md` and `docs/agents/`.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues (`helmidh1/video_notes_00` via `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles mapped to standard labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context documentation (`GLOSSARY.md` and `docs/adr/` at repo root). Read `GLOSSARY.md` for domain vocabulary (`Note Document`, `Vault`, `Attachment`, `Session Mirror`) and `docs/adr/` before touching persistence or player subsystems. See `docs/agents/domain.md`.

## Engineering guardrails

- **Unified quality gate**: Run `npm run check` (`tsc --noEmit && vitest run`) before committing changes.
- **Fresh worktree setup**: Run `npm install` (triggers `postinstall: wxt prepare`) to generate `.wxt/tsconfig.json` and type definitions.
