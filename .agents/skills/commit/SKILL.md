---
name: commit
description: >-
  Quick slash command alias for git-commit-push. Audits working diffs, runs test and build gates, generates conventional commit messages, stages changes, and pushes to remote.
---

# /commit (Git Add, Commit, and Push)

This is a direct slash command alias for the full [git-commit-push](../git-commit-push/SKILL.md) workflow.

## Execution Procedure

When invoked via `/commit`:
1. Run pre-commit checks using [.agents/skills/git-commit-push/scripts/verify-and-status.ps1](../git-commit-push/scripts/verify-and-status.ps1).
2. Follow all steps in [git-commit-push SKILL.md](../git-commit-push/SKILL.md):
   - **Pre-Flight Audit**: Check `git status`, ensure no secrets or temporary files (`scrap.txt`, `.env`).
   - **Quality Gates**: Ensure `npm run test` and `npx tsc --noEmit` pass.
   - **Stage**: `git add .` (or specific files).
   - **Commit**: Generate a Conventional Commit message following [commit-conventions.md](../git-commit-push/references/commit-conventions.md).
   - **Push**: `git push origin <branch>`.
   - **Report**: Output commit hash, branch, and clickable file links.
