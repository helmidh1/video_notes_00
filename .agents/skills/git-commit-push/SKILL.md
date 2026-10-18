---
name: git-commit-push
description: >-
  Automates a safe, verified Git workflow to inspect diffs, audit for secrets and unwanted files, run test and build validation gates, generate conventional commit messages, stage changes, commit, and push to remote. Use this skill whenever the user asks to git add, commit, and push, commit and push changes, sync the repository, or safely publish commits to Git.
---

# Git Add, Commit, and Push Workflow

This skill guides the agent through a disciplined, safe, and automated Git staging, committing, and pushing workflow. It ensures code quality gates are met, prevents accidental secret leaks or temporary file commits, generates semantic Conventional Commit messages, and pushes to the correct remote branch.

---

## 🧭 Workflow Overview

```
1. Audit & Status  ──▶  2. Quality Gates  ──▶  3. Stage (git add)  ──▶  4. Commit  ──▶  5. Push & Verify
   • Check git status      • Run test suite       • Selective or all       • Conventional    • Push to remote
   • Secret & temp audit   • Run type/build       • Confirm staged set       commit message  • Confirm clean tree
```

---

## Step 1: Pre-Flight Audit & Status Inspection

Before staging any files, inspect the repository state and ensure no sensitive or unintended files are about to be committed.

1. **Check Working Tree Status**:
   ```powershell
   git status
   ```
2. **Review Working Diffs**:
   ```powershell
   git diff --stat
   ```
3. **Secret & Artifact Leak Prevention**:
   - Check untracked files against `.gitignore`. Ensure build outputs (`.output/`, `.wxt/`, `dist/`, `build/`, `node_modules/`) are not being tracked.
   - Scan for potential API keys or credentials (e.g., `AIzaSy...`, `.env`, private keys, authentication tokens).
   - Check for temporary files or scratch notes (e.g., `scrap.txt`, `*.tmp`, `*.log`). If found, add them to [.gitignore](../../../.gitignore) or exclude them from staging.

---

## Step 2: Quality & Validation Gates

Never commit broken builds or failing tests without explicit user instructions.

1. **Run Unit Tests**:
   ```powershell
   npm run test
   ```
   Ensure all test files pass with 0 errors.

2. **Run Type-Checking / Build Verification**:
   ```powershell
   npx tsc --noEmit
   ```
   or:
   ```powershell
   npm run build
   ```
   If errors arise, fix them before proceeding to commit.

---

## Step 3: Stage Changes (`git add`)

1. **Stage Files**:
   - For all tracked/verified files:
     ```powershell
     git add .
     ```
   - Or stage specific paths if only a subset was requested:
     ```powershell
     git add <file1> <file2>
     ```
2. **Verify Staged Set**:
   ```powershell
   git status
   ```
   Verify that all staged items in "Changes to be committed" are expected.

---

## Step 4: Generate Conventional Commit Message (`git commit`)

Formulate a semantic commit message conforming to [Conventional Commits](./references/commit-conventions.md):

### Structure
```text
<type>(<scope>): <imperative summary>

[optional body explaining context, non-obvious rationale, or design choices]
```

### Commit Types
| Type | Purpose | Example |
| :--- | :--- | :--- |
| `feat` | New user-facing feature or enhancement | `feat: add live caption desktop bridge support` |
| `fix` | Bug fix or error resolution | `fix(vaultStorage): resolve File System Access API typing errors` |
| `refactor` | Code restructuring without behavior change | `refactor(sidepanel): modularize note timeline review modal` |
| `test` | Adding or updating unit/integration tests | `test(noteMerge): add non-destructive vault merging test cases` |
| `docs` | Documentation, README, or operating guide updates | `docs: document Chrome Live Caption desktop bridge setup` |
| `chore` | Dependency, config, or build tooling updates | `chore: update dependencies and ignore scrap files` |

Execute commit:
```powershell
git commit -m "<commit message>"
```

---

## Step 5: Push to Remote & Confirm

1. **Identify Current Branch & Remote**:
   ```powershell
   git branch --show-current
   git remote -v
   ```
2. **Push Commit(s)**:
   ```powershell
   git push origin <branch-name>
   ```
   *(If tracking is not yet configured, use `git push -u origin <branch-name>`)*
3. **Confirm Clean State**:
   ```powershell
   git status
   ```
   Verify: `"Your branch is up to date with 'origin/<branch-name>'"` and `"nothing to commit, working tree clean"`.

---

## Step 6: Post-Push Report

Present a concise summary to the user:
- **Commit SHA & Message**: Highlight the new commit hash and title.
- **Branch & Remote**: E.g., `main -> origin/main`.
- **Files Modified / Added**: Provide clickable file links using `file://` URIs.
- **Verification Gates**: State test and build status (`vitest: 10/10 passed`, `tsc: 0 errors`).

---

## Reference & Helpers

- [Conventional Commits Reference](./references/commit-conventions.md): Detailed conventions, scopes, and guidelines.
- [Verify & Status Script](./scripts/verify-and-status.ps1): Automated pre-commit verification script.
