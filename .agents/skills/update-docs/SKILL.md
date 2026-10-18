---
name: update-docs
description: >-
  Audits recent codebase changes, git status, and new components, then systematically synchronizes and updates GEMINI.md, README.md, package.json, architecture diagrams, agent rules, and any related documentation. Use this skill whenever the user asks to update GEMINI.md, README.md, documentation, project guides, or keep documentation in sync with recent code changes.
---

# Documentation Sync Workflow (GEMINI.md, README.md & Project Files)

This skill provides a systematic, automated workflow to audit recent codebase changes and keep **`GEMINI.md`**, **`README.md`**, and associated project documentation completely synchronized with active code.

---

## 🧭 Workflow Overview

```
1. Audit Codebase Changes  ──▶  2. Update GEMINI.md  ──▶  3. Update README.md  ──▶  4. Update Related Files  ──▶  5. Quality Gates & Report
   • git status & diffs         • Target architecture       • Key features                • package.json                 • npm run test
   • Run audit script           • Subsystem mechanics       • Shortcuts & Roadmap         • .agents/rules/               • npm run build
   • Find untracked files       • Invariants & safety       • Setup & CLI commands        • Companion docs               • Clickable summary
```

---

## Step 1: Audit Codebase & Git Status

1. **Run the Documentation Audit Script**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .agents/skills/update-docs/scripts/audit-docs.ps1
   ```
   *Alternative manual commands:*
   ```powershell
   git status --short
   git diff --stat HEAD
   ```

2. **Categorize Detected Changes**:
   - **New Components / Modules**: Any new `.tsx` components (e.g. `ReviewNoteModal.tsx`, `LiveCaptionsTab.tsx`), `.ts` utilities (e.g. `noteMerge.ts`), or backend bridges (e.g. `companion/caption_bridge.py`).
   - **Modified Behavior**: Changed heuristics (e.g. video player priority, timestamp parsing, frontmatter isolation, live caption deduplication).
   - **New Dependencies / Scripts**: New entries in `package.json` (`dependencies`, `devDependencies`, `scripts`).
   - **New Unit Tests**: Newly added test files in `tests/` and new test cases.

---

## Step 2: Synchronize `GEMINI.md` (Agent Operating Guide)

Refer to [Documentation Standards](./references/doc-standards.md) for detailed guidelines.

1. **Target Unified Architecture File Tree**:
   - Check the ASCII directory tree in `GEMINI.md`.
   - Ensure all current files in `entrypoints/`, `companion/`, `utils/`, `tests/`, and `.agents/` are listed with concise descriptions.
   - Remove obsolete files or rename outdated paths.

2. **Core Architectural Subsystems**:
   - If a new architectural capability was introduced (or an existing one significantly refactored), add or update its section under `## 🧩 Core Architectural Subsystems`.
   - Clearly document:
     - The problem solved and safety guarantees (e.g. non-destructive merging, zero data loss).
     - Component interaction flow.
     - Strict formats, regexes, or protocols.

3. **Engineering Guidelines & Ecosystem**:
   - Verify keyboard shortcuts, recommended MCPs, and tech stack versions.

---

## Step 3: Synchronize `README.md` (Public User Guide)

1. **Key Features Section**:
   - Add new bullet points highlighting user-visible capabilities with appropriate emojis (`⏱️`, `💎`, `🎙️`, `🔍`).
   - Clearly describe benefits without jargon.

2. **Keyboard Shortcuts Table**:
   - Verify every active shortcut in `entrypoints/sidepanel/App.tsx` and content scripts matches the table.

3. **Prerequisites & Getting Started**:
   - Ensure external runtime requirements (e.g. Python for companion bridge, Chrome settings) and installation steps are accurate.
   - Include any newly added npm scripts (e.g. `npm run caption-bridge`, `npm test`).

4. **Repository Structure**:
   - Match the updated directory layout.

5. **Roadmap Checklist**:
   - Mark implemented features as `[x]`.
   - Add newly identified roadmap goals under `[ ]`.

---

## Step 4: Synchronize Supporting Project Files

1. **`package.json`**:
   - Verify package `description`, `version`, and `scripts` reflect all development workflows.
2. **`.agents/rules/*.md`**:
   - Verify if any architectural constraints changed (e.g. Manifest V3 permissions, content script hooking).
3. **Companion & Sub-package Readmes**:
   - If a companion tool exists (e.g. `companion/`), ensure its usage instructions or script headers are up to date.

---

## Step 5: Validation Gates & Final Reporting

1. **Execute Tests**:
   ```powershell
   npm run test
   ```
   Ensure all tests pass.

2. **Verify Extension Build**:
   ```powershell
   npm run build
   ```
   Ensure the Vite / WXT build finishes with exit code 0.

3. **Generate Summary Report**:
   - List the updated files with clickable markdown links (`file:///...`).
   - Summarize the specific sections changed in `GEMINI.md`, `README.md`, and any supporting files.
