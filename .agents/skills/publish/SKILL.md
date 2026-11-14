---
name: publish
description: >-
  Quick slash command alias for portfolio-publish. Audits sensitive data, anonymizes git history, updates portfolio README documentation, runs quality gates, and publishes to remote.
---

# /publish (Portfolio & Open-Source Release)

This is a direct slash command alias for the full [portfolio-publish](../portfolio-publish/SKILL.md) workflow.

## Execution Procedure

When invoked via `/publish`:
1. Run pre-flight sensitive data and PII audit:
   ```powershell
   python .agents/skills/portfolio-publish/scripts/audit-and-anonymize.py --check
   ```
2. Follow all steps in [portfolio-publish SKILL.md](../portfolio-publish/SKILL.md):
   - **Audit**: Verify 0 personal identifiers, local paths, or private emails exist in files or git history.
   - **Anonymize**: Ensure all commit authors use generic contributor identity.
   - **Enrich Docs**: Keep README.md tailored for students, engineers, and PKM power users.
   - **Validate Quality Gates**: Run `npm test`, `npx tsc --noEmit`, and `npm run build`.
   - **Publish**: Push to remote and verify clean working tree.
