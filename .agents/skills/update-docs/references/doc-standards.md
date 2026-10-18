# Documentation Standards & Sync Guidelines

This reference defines the structure, conventions, and quality standards for all documentation files in the **Video Notes** project.

---

## 1. Document Roles & Responsibilities

| File | Target Audience | Primary Purpose | Key Sections to Maintain |
| :--- | :--- | :--- | :--- |
| **`GEMINI.md`** | AI Agents & Developers | Architectural operating guide, design decisions, subsystem mechanics, and coding rules. | Comparative Analysis, Ecosystem/Skills, Target Unified Architecture tree, Core Architectural Subsystems, Engineering Guidelines. |
| **`README.md`** | Users, Evaluators & Open Source Community | Public user-facing project manual, feature showcase, getting started, roadmap, and license. | Hero badges, Key Features, Keyboard Shortcuts table, Prerequisites, Installation & Setup, Repository Structure tree, Roadmap checklist. |
| **`package.json`** | Node.js & Extension Tooling | Dependency manifest, build & test scripts, package metadata. | `name`, `version`, `scripts` (e.g. `test`, `build`, `caption-bridge`), `dependencies`. |
| **`.agents/rules/*.md`** | AI Agent Context | Concise, hard constraints and architectural rules. | WXT MV3 constraints, File System Access API rules, CORS fallback rules. |

---

## 2. `GEMINI.md` Maintenance Standards

1. **Architecture Tree (`Target Unified Architecture`)**:
   - Must reflect all active modules in `entrypoints/`, `companion/`, `utils/`, `tests/`, and `.agents/`.
   - Every file must have an accompanying concise descriptive comment.
   - Use standard ASCII tree formatting (`├──`, `│   └──`).

2. **Core Architectural Subsystems**:
   - When new features or non-trivial fixes are implemented (e.g. non-destructive vault merging, real-time playhead seek tracking, frontmatter isolation, live captions bridge), document them under a dedicated heading with:
     - **Mechanism / Flow**: How data flows between browser tabs, content scripts, background workers, and disk.
     - **Safety / Invariants**: Guarantees (e.g. zero data loss, strictly validated timestamp ranges `00-59`).
     - **Key Modules**: Clickable links to primary implementing files.

3. **Engineering Guidelines**:
   - Maintain the four core pillars: Aesthetic Excellence, CORS-Resilient Screen Capture, Keyboard-First Experience, and Privacy & Security.

---

## 3. `README.md` Maintenance Standards

1. **Key Features**:
   - Group by feature area with emoji bullets (`📑`, `⏱️`, `📸`, `🎙️`, `🎓`, `📝`, `💎`, `🔍`, `🧠`, `⌨️`, `🛡️`).
   - Clearly highlight benefits for the user (e.g., "Non-destructive vault sync", "Resume at [MM:SS]").

2. **Keyboard Shortcuts**:
   - Keep table synchronized with active shortcuts in `entrypoints/sidepanel/App.tsx` and content scripts.
   - Currently: `Alt+S` (Capture frame), `Alt+T` (Insert timestamp), `Alt+P` (Play/pause video).

3. **Getting Started & Setup**:
   - Ensure all runtime prerequisites are listed (Node.js 18+, Python 3.10+ for Live Caption bridge, Chromium 114+).
   - Document any new CLI commands or companion bridges (e.g. `npm run caption-bridge`).

4. **Roadmap Checklist**:
   - Keep completed features marked as `[x]`.
   - Add new backlog or exploratory features under `[ ]`.

---

## 4. Markdown Formatting & Link Conventions

1. **File Links**:
   - In responses and agent documentation, use GitHub-style markdown links with the `file://` scheme and forward slashes:
     - `[filename](file:///path/to/file)`
     - `[ComponentName](file:///path/to/file#L10-L20)`
2. **Alerts & Callouts**:
   - Use GitHub-flavored callouts for warnings and important context:
     - `> [!NOTE]`
     - `> [!TIP]`
     - `> [!IMPORTANT]`
     - `> [!WARNING]`
3. **Code Fencing**:
   - Always specify the language identifier for code blocks (`bash`, `powershell`, `typescript`, `tsx`, `json`, `mermaid`).
