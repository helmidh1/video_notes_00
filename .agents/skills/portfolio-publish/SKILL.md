---
name: portfolio-publish
description: >-
  Prepares, audits, anonymizes, documents, and publishes the repository for open-source sharing and public portfolios. Scrubs sensitive data and personal identifiers from files and git history, crafts comprehensive use-case-driven README.md documentation, verifies quality gates, and safely publishes clean commits.
---

# Portfolio Publish & Open-Source Preparation Workflow

This skill guides the agent through preparing, auditing, anonymizing, documenting, and publishing a repository for public sharing and professional portfolios. It guarantees that no personal identifiers, private accounts, API keys, or local directory paths leak into the codebase or its Git history, while ensuring documentation is easy to read, complete, and tailored for diverse user use cases.

---

## 🧭 Workflow Overview

```
1. Sensitive Data Audit  ──▶  2. Anonymize History  ──▶  3. Enrich Documentation  ──▶  4. Quality Gates  ──▶  5. Publish & Verify
   • Scan files for PII         • Rewrite commit authors   • Tailored use cases         • Run vitest (37/37)   • Force push to remote
   • Check git blobs & refs     • Clean past commit diffs  • Quick start & install      • Strict tsc check     • Expire reflogs
   • Audit commit history       • Zero reverse-engineering • Architecture diagram       • Production build     • Confirm clean state
```

---

## Step 1: Pre-Flight Sensitive Data & Anonymization Audit

Before publishing to any public repository or portfolio:

1. **Run the Automated Audit Script**:
   ```powershell
   python .agents/skills/portfolio-publish/scripts/audit-and-anonymize.py --check
   ```
2. **Manual Inspection Checks**:
   - **Personal Names & Usernames**: Search for personal names, GitHub handles, or account usernames across all tracked files:
     ```powershell
     git grep -i "<username>"
     ```
   - **API Keys & Credentials**: Scan for Google AI Studio keys (`AIzaSy...`), GitHub tokens (`ghp_...`), or OpenAI keys (`sk-...`).
   - **Local Directory Paths**: Verify no absolute local filesystem paths (e.g., `C:\Users\...`, `/home/...`) exist in source files, tests, or documentation.
   - **Git Commit Authors**: Check all past commit author names and emails:
     ```powershell
     git log --format="%H | %an | %ae | %cn | %ce | %s"
     ```

---

## Step 2: Git History Anonymization & Author Scrubbing

If historical commits contain personal identifiers or private emails, rewrite git history to ensure no one can reverse engineer personal data:

1. **Configure Local Anonymous Git Identity**:
   ```powershell
   git config user.name "Video Notes Contributor"
   git config user.email "contributor@users.noreply.github.com"
   ```
2. **Rewrite Historical Commits**:
   - Reconstruct commits with anonymous author/committer identities (`contributor@users.noreply.github.com`).
   - Scrub any personal names or clone URLs from historical blob versions (e.g. past `README.md` versions).
3. **Purge Dangling References & Reflogs**:
   ```powershell
   git reflog expire --expire=now --all
   git gc --prune=now
   ```
4. **Verify Deep Object Store**:
   Ensure 0 objects in the git database contain any trace of personal identifiers:
   ```powershell
   python -c "
   import subprocess
   out = subprocess.check_output(['git', 'rev-list', '--objects', 'main']).decode()
   print('Total objects:', len(out.strip().split('\n')))
   "
   ```

---

## Step 3: Portfolio & Use-Case Documentation Enrichment

A portfolio-grade project must immediately explain what it does, why it matters, and how anyone can use it for their own situation:

1. **Tailored Use-Case Guidance**:
   Ensure [README.md](../../../README.md) provides dedicated sections for:
   - **Students & Academics**: Canvas LMS / Canvas Studio lecture integration, Cornell Notes, and Obsidian Flashcards.
   - **Engineers & Technical Learners**: Screencast code capture (`Alt+S`), Gemini OCR code transcription, and interactive timestamp seek.
   - **PKM & Obsidian Enthusiasts**: HTML5 File System Access API, Wikilinks `![[attachments/frame.webp]]`, Dataview YAML frontmatter, and non-destructive merging.
   - **Researchers & Podcasters**: Live subtitle streaming, smart pause chunking, and hands-free voice dictation (`🎙️`).
2. **Visual Architecture Diagram**:
   Include a clear ASCII or Mermaid diagram illustrating the extension runtime:
   - Content Script `<video>` observer & subtitle scraper
   - Chromium Side Panel React UI & dual Markdown editor
   - File System Access API & Obsidian local vault
   - Google Gemini 3.8 / 2.0 Flash multimodal vision API
3. **Clear Step-by-Step Installation**:
   - Prerequisites (Node 18+, Chromium browser, free Google Gemini key).
   - Building and loading the unpacked MV3 extension.
   - Connecting an Obsidian vault folder in 1 click.
4. **Permissive License**:
   Ensure a clean [LICENSE](../../../LICENSE) (e.g. MIT) with generic open-source attribution is included.

---

## Step 4: Quality & Validation Gates

Never publish unverified code to a public portfolio:

1. **Run Unit Test Suites**:
   ```powershell
   npm test
   ```
   *Verify 37/37 tests pass across note merging, vault storage, and timestamp extraction.*
2. **Strict TypeScript Typecheck**:
   ```powershell
   npx tsc --noEmit
   ```
   *Verify 0 compilation errors.*
3. **Companion Test Suite (if applicable)**:
   ```powershell
   python companion/test_caption_bridge.py
   ```
   *Verify 15/15 tests pass.*
4. **Production Extension Build**:
   ```powershell
   npm run build
   ```
   *Verify clean WXT Manifest V3 bundle output.*

---

## Step 5: Remote Publish & Verification

1. **Verify Staged Changes**:
   ```powershell
   git status
   ```
2. **Commit with Conventional Commit Message**:
   ```powershell
   git commit -m "docs: enrich README and add portfolio-publish skill"
   ```
3. **Publish to Remote**:
   - If history was rewritten:
     ```powershell
     git push --force origin main
     ```
   - If publishing a new remote repository:
     ```powershell
     git remote set-url origin <new-public-repo-url>
     git push -u origin main
     ```
4. **Confirm Clean State**:
   ```powershell
   git status
   ```
   *Confirm working tree is clean and up to date.*

---

## 📋 Completion Checklist

- [ ] Zero personal identifiers, real names, or private emails in files.
- [ ] Zero sensitive credentials, tokens, or API keys in repository.
- [ ] All commit authors set to anonymous contributor identity.
- [ ] No historical git blobs contain scrubbed personal text.
- [ ] README.md enriched with tailored use cases, quick start, architecture diagram, and license.
- [ ] MIT LICENSE file present.
- [ ] All unit tests (`npm test`) pass (37/37).
- [ ] Strict typecheck (`npx tsc --noEmit`) passes with 0 errors.
- [ ] Production extension builds cleanly (`npm run build`).
- [ ] Remote repository synchronized and clean.
