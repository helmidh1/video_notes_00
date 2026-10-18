---
name: docs
description: >-
  Quick slash command alias for update-docs. Audits codebase changes, tests, and file diffs, then updates GEMINI.md, README.md, and related project documentation.
---

# /docs (Documentation Synchronization)

This is a direct slash command alias for the full [update-docs](../update-docs/SKILL.md) workflow.

## Execution Procedure

When invoked via `/docs`:
1. Run documentation audit:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .agents/skills/update-docs/scripts/audit-docs.ps1
   ```
2. Follow all steps in [update-docs SKILL.md](../update-docs/SKILL.md):
   - **Audit**: Detect changed, new, or removed files across `entrypoints/`, `utils/`, `companion/`, and `tests/`.
   - **Sync GEMINI.md**: Update Target Unified Architecture tree, Core Subsystems, and agent rules.
   - **Sync README.md**: Update Key Features, Keyboard Shortcuts, Repository Structure, and Roadmap.
   - **Sync Supporting Files**: Verify `package.json` scripts and `.agents/rules/`.
   - **Validate**: Run `npm run test` and `npm run build`.
   - **Report**: Provide a concise summary with clickable file links.
