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

### 2. Active Workspace Skills (`.agents/skills/`)
- `update-docs` / `docs`: Automated audit and synchronization workflow for `GEMINI.md`, `README.md`, `package.json`, and project docs.
- `git-commit-push` / `commit`: Safe pre-commit audit, typecheck/test validation gates, Conventional Commits formatting, staging, and remote push.
- `wxt-extension-dev`: Architectural cheatsheet and rules for WXT, Chromium Manifest V3, Side Panel API, Content Script lifecycle, and isolated world execution.
- `obsidian-markdown-spec`: Reference specifications for Obsidian Markdown (Wikilinks `![[attachment.png]]`, callout formats `> [!tip]`, frontmatter schemas, Dataview tags, and timestamp deep links).
- `gemini-multimodal-assistant`: Multimodal prompt engineering guides for Gemini 2.0 / 2.5 Flash (OCR, architecture diagram interpretation, code transcription, and structured study notes).
- `video-player-controller`: Cross-platform video player hooking patterns (YouTube, HTML5 video, Vimeo, Udemy) with robust CORS fallback via `chrome.tabs.captureVisibleTab`.

### 3. Core Free Libraries & Tech Stack
- **Extension Engine**: **WXT** (`wxt.config.ts`) with Chromium MV3, TypeScript, and Vite.
- **Frontend UI**: React 18/19, Lucide Icons (`lucide-react`), Dark Glassmorphic CSS design tokens.
- **Multimodal AI**: **Google Gen AI SDK** (`@google/genai`) using **Gemini 2.5 / 2.0 Flash / Pro** (Free tier on Google AI Studio: 15 RPM, 1M TPM, 1,500 RPD).
- **Offline / Local AI**: **Chrome Built-in AI** (`window.ai` / Prompt API via Gemini Nano) and **Chrome Live Caption** companion bridge.
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
├── companion/                      # Live Caption Desktop Bridge
│   ├── caption_bridge.py           # Windows UIA live caption WebSocket server (ws://localhost:8765)
│   ├── test_caption_bridge.py      # Unit tests for UIA window filtering, pause flush & delta extraction
│   └── run_bridge.bat              # Quick start batch launcher
├── entrypoints/
│   ├── background.ts               # Side Panel behavior, CORS screenshot fallback handler
│   ├── content.ts                  # Multi-video player detector, DOM observer, timestamp sync & WebVTT captions
│   └── sidepanel/                  # Premium React note-taking workspace
│       ├── App.tsx                 # Core sidepanel state, live playhead banner & non-destructive vault loader
│       ├── index.html              # HTML container
│       ├── main.tsx               # React mount root
│       ├── components/
│       │   ├── Editor.tsx          # Markdown editor with timestamp hotkeys & live preview
│       │   ├── FrameGallery.tsx    # Captured frames with OCR, Explain, and Seek actions
│       │   ├── LiveCaptionsTab.tsx # Source-isolated caption stream (bridge, web cues, Web Speech) with pause debounce
│       │   ├── AIAssistant.tsx     # Gemini multimodal chat & transcript summarizer
│       │   ├── ReviewNoteModal.tsx # Obsidian review modal with chronological timeline & resume action
│       │   ├── Toolbar.tsx         # Scrollable quick action bar & Obsidian export controls
│       │   └── SettingsModal.tsx   # Obsidian vault connector & API configuration
│       └── styles/
│           └── theme.css           # Dark glassmorphic tokens & typography
├── utils/
│   ├── geminiClient.ts             # Gemini 2.0/2.5 Flash multimodal vision & transcript API
│   ├── messaging.ts                # Type-safe extension message definitions
│   ├── noteMerge.ts                # Non-destructive vault merging, strict timestamp parsing & attachment rehydration
│   ├── templates.ts                # Cornell, lecture & flashcard templates
│   ├── transcriptExtractor.ts      # Multi-tier caption extractor (textTracks, YouTube DOM, API)
│   └── vaultStorage.ts             # Obsidian vault writer, Wikilink generator, image saver
├── tests/
│   ├── noteMerge.test.ts           # Non-destructive merge, frontmatter isolation & timestamp tests
│   ├── utils.test.ts               # Timestamp formatting, seek parsing & caption deduplication tests
│   └── vaultStorage.test.ts        # Obsidian vault writer, Wikilink & attachment tests
├── package.json                    # Project dependencies and build scripts
├── tsconfig.json                   # Strict TypeScript configuration
├── wxt.config.ts                   # WXT Manifest V3 extension configuration
├── GEMINI.md                       # This agent operating guide
└── README.md                       # Public-facing user & developer documentation
```

---

## 🧩 Core Architectural Subsystems

### 1. Non-Destructive Vault Merging & Attachment Rehydration (`utils/noteMerge.ts`)
- **Safety Guarantee**: Saving to an existing Obsidian note never wipes, truncates, or blindly overwrites content.
- **Content Matching**: Locates existing files by matching sanitized titles or `url:` in the YAML frontmatter.
- **Intelligent Diff Merging**:
  - Preserves user edits made in Obsidian outside the browser, alongside `###` section headers and `- [MM:SS](...)` live caption bullets (`type: 'caption'`).
  - Appends new timestamped sections and snapshot attachments seamlessly.
  - Automatically rehydrates captured frame images from the vault's attachment directory (`attachments/`) across browser sessions and reloads.

### 2. Accurate Video Player Detection & Real-Time Playhead Tracking (`entrypoints/content.ts`)
- **Targeted Selector**: Explicitly prioritizes main video players:
  1. `video.html5-main-video` (YouTube primary player)
  2. `video.vjs-tech` (Canvas LMS / Canvas Studio / Video.js)
  3. Playing video elements with rendered area `> 15,000 px²` (filtering out 160×90 hover preview thumbnails)
- **Continuous Event Hooking**:
  - Subscribes to `seeked`, `pause`, `play`, and `timeupdate` events.
  - Broadcasts `VIDEO_TIME_UPDATE` to the extension runtime.
  - Automatically caches the last playback position in `chrome.storage.local` under `video_pos_${cleanUrl}`.
  - Hooks SPA navigation via `yt-navigate-finish` and `popstate` to keep track across internal YouTube navigations.

### 3. Frontmatter Isolation & Strict Timestamp Parsing
- **Frontmatter Stripping**: Extracts and isolates YAML frontmatter prior to regex parsing, preventing ISO timestamp strings (e.g. `updated: 2026-10-17T20:53:05.123Z`) from being parsed as 20-hour video timestamps.
- **Strict Validation**: Requires seconds to strictly match `[0-5]\d` (`00-59`).
- **Ordered Last Note Lookup**: `getLastRecordedTimestamp(markdown)` retrieves the most recently appended note entry in document order rather than just the mathematical maximum second.

### 4. Standalone In-Browser Captions, Subtitles & Voice Dictation (`LiveCaptionsTab.tsx`)
- **Zero-Setup In-Browser Engine**: Runs completely inside Chrome without requiring any Python companion script or external bridge processes.
- **Automated Subtitle Streamer**: When active in the side panel, `content.ts` (`liveCaptionsEnabledBySidePanel`) captures captions on the active video tab across YouTube, Coursera, Udemy, Canvas LMS, and any HTML5 video player via [`selectPreferredCaptionTrack`](entrypoints/content.ts) (selecting a single `captions`/`subtitles` track) and optionally enabling YouTube CC when `autoEnableCC` is active (disabled automatically if the desktop bridge connects first).
- **Browser-Native Web Speech Dictation**: Uses `webkitSpeechRecognition` for hands-free lecture speech transcription and voice note dictation with real-time video timestamp tagging and clean fatal-error recovery.
- **Optional Desktop Bridge**: Gracefully auto-connects to local bridge `ws://localhost:8765` if running, prioritizes bridge output over in-browser web captions when connected, and uses `reconcileBridgeDeltaWithSafetyCommit()` to avoid duplicate prefixes across pause flushes.

### 5. Multi-Tier Frictionless Obsidian Note Saving
- **Direct Vault Storage**: Writes markdown notes and `.webp` attachments directly into user-selected Obsidian vault folders using the File System Access API.
- **Startup & Tab Synchronization**: Listens to `chrome.tabs.onActivated`, `chrome.tabs.onUpdated`, and active-tab `VIDEO_TIME_UPDATE` events via [`switchNoteContext`](entrypoints/sidepanel/App.tsx) (`isProvisionalTitleRef`, `captureSaveSnapshot`, and `saveQueueRef`), flushing outgoing context writes before switching videos without leaking stale titles or cross-tab state.
- **Obsidian Protocol URI (`obsidian://open`)**: Direct one-click shortcut from the extension toolbar to open the active note inside the desktop Obsidian application.
- **One-Click Markdown Export**: Direct browser download of `.md` notes and attachments for instant access even without local folder picker permissions.

### 6. Continuous Background Caption Processing & Smart Pause Chunking (`App.tsx`, `LiveCaptionsTab.tsx`, `caption_bridge.py`)
- **Persistent Tab Mounting & Active-Tab Scoping**: `App.tsx` keeps all side panel tabs mounted using CSS visibility toggling (`display: flex` / `none`) so live caption streams, Web Speech dictation, and the optional WebSocket bridge listener remain active across tabs, while gating incoming captions and video updates to the active video tab/context (`switchNoteContext`, `isVideoOrNoteTab`).
- **Auto-Append & Source Isolation**: `LiveCaptionsTab.tsx` persists the `autoAppend` toggle in `chrome.storage.local` (defaulting to `true`), isolates buffers and timers per caption source via `streamStatesRef`, and maintains an auto-reconnect loop when the desktop bridge is offline.
- **Smart Pause Flush & Rolling-Bubble Alignment**: `CaptionStreamTracker` in `caption_bridge.py` (`process_events()` and `_split_completed_sentences()` committing completed sentences on punctuation without waiting for trailing unpunctuated clauses, excluding Chrome browser windows, filtering UI button controls on descendants, and flushing trailing incomplete speech only after a 4.0s pause or source detach) paired with `extract_delta_text()` / `extractDeltaText()` (normalized prefix matching and bigram-guarded tail-anchor alignment across un-scrolled rolling bubbles with ASR seam edits) and `processBridgeCaption` / `processWebCaption` (5.5s bridge safety fallback and 2.0s web caption debounce) flushes incremental captions into timestamped note entries without carry-over duplication or mid-sentence splits.

### 7. Scrollable Header Toolbar with Mouse Wheel Navigation (`Toolbar.tsx`, `theme.css`)
- **Horizontal Overflow Handling**: `Toolbar.tsx` wraps action button groups (`flexShrink: 0`) inside a `minWidth: 'max-content'` container within an `overflowX: 'auto'`, `whiteSpace: 'nowrap'` scroll region so compact side panel widths never clip controls.
- **Mouse Wheel & Visual Polish**: Attaches an `onWheel` listener to translate vertical mouse wheel scrolling into horizontal toolbar scrolling, styled with the `.scrollable-toolbar` 4px translucent scrollbar in `theme.css`.

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
   - `Alt+P`: Play / Pause video without leaving the note editor.

4. **Privacy & Security**:
   - API keys stored securely in `chrome.storage.local`.
   - Direct local file writes via browser File System Access API; zero third-party cloud data transmission.
