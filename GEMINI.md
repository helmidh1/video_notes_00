# Video Notes (HoverNotes Re-engineered) — Agent Operating Guide

> **Project Mission**: A local-first, multimodal AI video note-taking browser extension and companion inspired by HoverNotes. Built for students, engineers, and researchers to capture knowledge from YouTube, Coursera, Udemy, and local video lectures directly into **Obsidian** and **Markdown** vaults without context switching.

---

## 🔬 Comparative Analysis: Argon Prototypes

Gemini 4 Argon generated two exploratory prototypes: `hovernotes-clone-scaffold` and `hovernotes-clone-multimodal`.

### 1. `hovernotes-clone-scaffold` (Baseline Architecture)
- **Strengths**:
  - Leverages **WXT (`wxt`)** with Manifest V3 and `@wxt-dev/module-react`.
  - Implements Chrome `sidePanel` API (`openPanelOnActionClick: true`) for native sidebar experience.
  - Uses the **HTML5 File System Access API** (`showDirectoryPicker`) persisted with `idb-keyval` to write `.md` notes and binary screenshots directly to a user's chosen local folder (Obsidian vault).
  - Clean message-passing protocol (`CAPTURE_VIDEO_FRAME`, `EXTRACT_TRANSCRIPT`, `SEEK_VIDEO`) between Side Panel and Content Script.
  - Scrapes YouTube DOM (`<ytd-transcript-segment-renderer>`) and HTML5 `textTracks` for caption extraction.
  - Basic text summarization with `@google/genai` (`gemini-2.5-flash`).
- **Weaknesses**:
  - Unstyled, raw prototype UI (plain HTML buttons, basic text inputs, unstyled textarea).
  - No visual frame analysis or OCR.
  - Canvas capture (`ctx.drawImage`) fails on cross-origin (CORS) protected video streams without fallback.
  - No hotkeys, no inline timestamp insertion, and no markdown preview.

### 2. `hovernotes-clone-multimodal` (Vision Enhancement)
- **Strengths**:
  - Inherits the clean WXT scaffold foundation.
  - Introduces `analyzeVideoFrameWithGemini()` using `@google/genai` to analyze captured video frames (slides, diagrams, formulas, code).
  - Transcribes visible source code into fenced Markdown code blocks and adds Obsidian callouts (`> [!info] AI Frame Analysis`).
- **Weaknesses**:
  - Shares the same unstyled, raw UI as the scaffold.
  - Frame analysis only triggered manually per image item, without streaming or unified prompt customization.
  - Captions extraction remains brittle if YouTube transcript sidebar is closed.
  - Disconnected from the root workspace structure.

---

## 🛠️ Recommended Ecosystem: Free MCPs, Skills & Plugins

To achieve the best possible developer and user experience, the following free tools, MCPs, skills, and plugins are integrated into the architecture:

### 1. Recommended Free MCP Servers
| MCP Server | Role & Benefit | Integration Mode |
| :--- | :--- | :--- |
| **Filesystem MCP** (`@modelcontextprotocol/server-filesystem`) | Enables AI assistants to read, write, and index local Obsidian vaults, assets, and project files directly. | Local Stdio / AGY MCP |
| **Obsidian Local REST API MCP** | Optional bridge to Obsidian's free Local REST API plugin. Allows querying active notes, appending timestamps, searching vault tags, and triggering Obsidian commands directly. | HTTP / Stdio |
| **Puppeteer / Browser Automation MCP** | Automates end-to-end testing of extension injection, video seek synchronization, and canvas capture across YouTube and web video players. | Headless Chrome |
| **StitchMCP** *(Configured)* | Generates UI design systems and aesthetic component variants for high-contrast dark mode interfaces. | Google Stitch MCP |

### 2. Recommended Agent Skills (`.agents/skills/`)
- `wxt-extension-dev`: Architectural cheatsheet and rules for WXT, Chromium Manifest V3, Side Panel API, Content Script lifecycle, and isolated world execution.
- `obsidian-markdown-spec`: Reference specifications for Obsidian Markdown (Wikilinks `![[attachment.png]]`, callout formats `> [!tip]`, frontmatter schemas, Dataview tags, and timestamp deep links).
- `gemini-multimodal-assistant`: Multimodal prompt engineering guides for Gemini 2.0 / 2.5 Flash (OCR, architecture diagram interpretation, code transcription, and structured study notes).
- `video-player-controller`: Cross-platform video player hooking patterns (YouTube, HTML5 video, Vimeo, Udemy) with robust CORS fallback via `chrome.tabs.captureVisibleTab`.

### 3. Core Free Libraries & Tech Stack
- **Extension Engine**: **WXT** (`wxt.config.ts`) with Chromium MV3, TypeScript, and Vite.
- **Frontend UI**: React 18/19, Lucide Icons (`lucide-react`), TailwindCSS or Custom Glassmorphic CSS.
- **Multimodal AI**: **Google Gen AI SDK** (`@google/genai`) using **Gemini 2.0 Flash / 2.5 Flash** (Free tier on Google AI Studio: 15 RPM, 1M TPM, 1,500 RPD).
- **Offline / Local AI**: **Chrome Built-in AI** (`window.ai` / Prompt API via Gemini Nano) as a zero-cost, local-first fallback.
- **Local Storage & File I/O**: File System Access API (`showDirectoryPicker`) + `idb-keyval` for persistent directory handles.
- **Markdown & Preview**: Split-pane / toggleable live Markdown previewer with syntax highlighting and clickable timestamp seek anchors.

---

## 🏛️ Target Unified Architecture

```
video_notes_00/
├── .agents/                        # Agent customizations, rules, and skills
│   ├── rules/
│   │   └── wxt-mv3-video-extension.md
│   └── skills/
│       ├── wxt-extension-dev/
│       ├── obsidian-markdown-spec/
│       └── gemini-multimodal-assistant/
├── entrypoints/
│   ├── background.ts               # Side Panel behavior, CORS screenshot fallback handler
│   ├── content.ts                  # Resilient video player detector, DOM observer, timestamp sync
│   └── sidepanel/                  # Premium React note-taking workspace
│       ├── App.tsx                 # Core sidepanel state & layout
│       ├── index.html              # HTML container
│       ├── main.tsx               # React mount root
│       ├── components/
│       │   ├── Editor/             # Markdown editor with timestamp hotkeys & live preview
│       │   ├── FrameGallery/       # Captured frames with OCR, Explain, and Seek actions
│       │   ├── AIAssistant/        # Gemini multimodal chat & transcript summarizer
│       │   ├── VaultManager/       # File System Access API directory connector
│       │   └── UI/                 # Glowing buttons, badges, modals, status toasts
│       └── styles/                 # Dark glassmorphic tokens & typography
├── utils/
│   ├── geminiClient.ts             # Gemini 2.0/2.5 Flash multimodal vision & transcript API
│   ├── messaging.ts                # Type-safe extension message definitions
│   ├── transcriptExtractor.ts      # Multi-tier caption extractor (textTracks, YouTube DOM, API)
│   ├── videoController.ts          # Video detection, seek, playback rate, CORS fallback
│   └── vaultStorage.ts             # Obsidian vault writer, Wikilink generator, image saver
├── package.json                    # Project dependencies and build scripts
├── tsconfig.json                   # Strict TypeScript configuration
├── wxt.config.ts                   # WXT Manifest V3 extension configuration
├── GEMINI.md                       # This agent operating guide
└── README.md                       # Public-facing user & developer documentation
```

---

## 📋 Engineering Guidelines & Quality Standards

1. **Aesthetic Excellence**:
   - Modern dark mode palette (`#090d16`, `#111827`, luminous violet/indigo accents `#6366f1` / `#8b5cf6`).
   - Glassmorphic translucent surfaces (`backdrop-blur-md`, subtle borders `rgba(255,255,255,0.08)`).
   - Clean typography using system font stacks or Inter / JetBrains Mono.

2. **CORS-Resilient Screen Capture**:
   - Primary: `<video>` frame capture via Canvas 2D (`ctx.drawImage`).
   - Secondary Fallback: If canvas is tainted or cross-origin restricted, request `chrome.tabs.captureVisibleTab` from the background service worker, cropped to the video's bounding client rect.

3. **Keyboard-First Experience**:
   - `Alt+S`: Capture frame snapshot and insert into note.
   - `Alt+T`: Insert interactive timestamp `[MM:SS]` at cursor position.
   - `Alt+Space`: Play / Pause video without leaving the note editor.
   - `Alt+J` / `Alt+K`: Jump backward / forward 5 seconds.

4. **Privacy & Security**:
   - API keys stored securely in `chrome.storage.local`.
   - Direct local file writes via browser File System Access API; zero third-party cloud data transmission.
