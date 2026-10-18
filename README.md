# 🎬 Video Notes (HoverNotes Re-engineered)

> **Local-First, Multimodal AI Video Note-Taking Browser Extension for Obsidian & Markdown**

[![Chrome Extension](https://img.shields.io/badge/Chrome_MV3-Side_Panel-blue.svg)](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
[![WXT](https://img.shields.io/badge/Built_with-WXT-brightgreen.svg)](https://wxt.dev)
[![Gemini](https://img.shields.io/badge/AI-Gemini_3.8_Flash-orange.svg)](https://ai.google.dev/)
[![Obsidian Ready](https://img.shields.io/badge/PKM-Obsidian_Native-purple.svg)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Video Notes** bridges online lecture platforms (**Canvas LMS**, **Canvas Studio**, **YouTube**, **Coursera**, **Udemy**, and local lectures) with your Personal Knowledge Management (PKM) vault. It provides a distraction-free, side-by-side floating note workspace with 1-click video snapshots, interactive timestamps, live subtitle extraction, on-device Chrome Live Caption integration, and multimodal AI analysis powered by Google Gemini.

---

## ✨ Key Features

- 📑 **Native Chrome Side Panel**: Docked right beside your video player. Zero window-juggling or tab-switching.
- ⏱️ **Interactive Timestamps & Real-Time Sync**: Click any timestamp in your notes (`[04:21]`) to instantly seek the video to that exact second. Actively tracks video playhead across seeks, pauses, and page navigation with thumbnail-filtering heuristics.
- 🎯 **Accurate "Resume at [MM:SS]"**: Remembers where you stopped watching across sessions and browser refreshes (`chrome.storage.local`). Intelligently distinguishes between current playhead, saved watch progress, and the latest written note timestamp while isolating frontmatter dates.
- 📸 **Timestamped Visual Snapshots**: Grab high-resolution slides, diagrams, and code snippets with `Alt+S` or 1-click. Saved automatically to your vault's attachments folder.
- 🎙️ **Real-Time Chrome Live Captions**: Stream live on-device speech-to-text directly from **Chrome Live Caption** (`chrome://settings/accessibility`) into your notes with synchronized timestamps. Features intelligent delta-deduplication so only fresh sentences are captured.
- 🎓 **Canvas LMS & Video.js Support**: Deep integration with Canvas LMS course pages, Canvas Studio embeds, and Video.js players across nested iframes with accurate time sync and closed-caption scraping.
- 📝 **Dual Edit & Live Preview Editor**: Split-mode Markdown editor with live image rendering, clickable timestamp anchors, and note templates (Cornell Notes, Lecture Notes, Obsidian Flashcards Deck).
- 💎 **Non-Destructive Vault Sync & Auto-Save**: Uses the **HTML5 File System Access API** (`showDirectoryPicker`) to save `.md` files and `.webp` attachments straight to your local Obsidian folder without any cloud intermediary. Features intelligent **non-destructive merging** with zero data loss—never overwriting your past progress or duplicating timestamps when returning to a video. Includes debounced real-time saving (2.5s) and a 15-second heartbeat auto-save with in-memory handle persistence.
- 🔍 **Review Note & Timestamps Timeline**: Dedicated Review modal and top banner strip displaying all timestamps noted in your Obsidian file. Search note text, preview rendered Markdown, copy snippet blocks, or hit **"Resume at [MM:SS]"** to instantly continue the lecture where you previously left off. Rehydrates past frame attachments from disk across refreshes.
- 🧠 **Multimodal AI Companion (Gemini 3.8 / 2.0 Flash)**:
  - **Frame Explainer & OCR**: Transcribes visible code, formulas, and diagrams into fenced Markdown blocks and Obsidian callouts (`> [!info]`).
  - **Structured Transcript Summaries**: Automatically turns video captions into comprehensive study notes with timestamped headings.
  - **Context-Aware Study Chat**: Ask questions directly about the lecture slides, transcript, and active notes.
- ⌨️ **Keyboard-First Workflow**: Control playback (`Alt+P`), drop timestamps (`Alt+T`), and capture slides (`Alt+S`) without taking your hands off the keyboard.
- 🛡️ **Privacy & Local-First**: Your notes, screenshots, and keys never touch 3rd-party servers. All requests go directly from your browser to Google AI Studio and your local disk.

---

## ⚡ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Alt + S` | Capture current video frame & insert into active note |
| `Alt + T` | Insert current timestamp `[MM:SS]` at cursor position |
| `Alt + P` | Play / Pause active video player (works in Canvas & YouTube) |

---

## 🛠️ Architecture & Tech Stack

- **Extension Framework**: [WXT](https://wxt.dev) (Vite-powered Next-Gen Web Extension Framework)
- **Manifest**: Chromium Manifest V3 (`sidePanel`, `storage`, `activeTab`, `scripting`, `all_frames`)
- **Frontend**: React 18/19, TypeScript, Lucide Icons
- **Styling**: Dark Glassmorphism with CSS Custom Properties
- **Storage**: Browser File System Access API + `idb-keyval` for persistent directory handles
- **AI Models**: Google Gemini 3.8 Flash / Gemini 3.8 Pro (`@google/genai`)
- **Live Caption Bridge**: Lightweight local WebSocket bridge in Python (`uiautomation` + `websockets`)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and `npm`
- Python 3.10+ (for the Chrome Live Caption bridge)
- Google Chrome, Brave, or Microsoft Edge (Chromium 114+ with Side Panel support)
- A free Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/)

### Installation & Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/helmidh1/video_notes_00.git
   cd video_notes_00
   ```

2. **Install dependencies**:
   ```bash
   npm install
   pip install uiautomation websockets
   ```

3. **Run unit tests**:
   ```bash
   npm test
   ```

4. **Build the extension**:
   ```bash
   npm run build
   ```

5. **Load into Google Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** (toggle in the top-right corner).
   - Click **Load unpacked** and select the `.output/chrome-mv3` directory.
   - Open any video (YouTube, Canvas LMS, Coursera) and click the **Video Notes** extension icon to open the Side Panel.

6. **Connect Your Local Vault**:
   - In the Side Panel header or Settings (`⚙️`), click **Select Vault** and choose your Obsidian vault directory.
   - Enter your **Gemini API Key** (stored locally in browser storage).

7. **Live Caption Transcription (Optional, for Any Video/Canvas Lecture)**:
   - In Chrome, open `chrome://settings/accessibility` and toggle **Live Caption** to **ON**.
   - In your project terminal, start the companion bridge:
     ```bash
     npm run caption-bridge
     ```
   - Open the **Captions** tab in the Video Notes Side Panel. Live speech will stream directly with interactive timestamps!

---

## 📁 Repository Structure

```
video_notes_00/
├── .agents/                        # Agent rules, workflows, and task configs
├── companion/                      # Live Caption Desktop Bridge
│   ├── caption_bridge.py           # Windows UIA live caption WebSocket bridge (ws://localhost:8765)
│   └── run_bridge.bat              # Launcher batch script
├── entrypoints/
│   ├── background.ts               # Side panel behavior & visibleTab screenshot fallback
│   ├── content.ts                  # Multi-frame video detector, DOM observer & timestamp sync
│   └── sidepanel/                  # React note-taking workspace
│       ├── App.tsx                 # Main layout, live playback banner & vault sync
│       ├── index.html              # Side panel HTML container
│       ├── main.tsx                # React mount entrypoint
│       ├── components/
│       │   ├── Editor.tsx          # Markdown editor with live preview
│       │   ├── FrameGallery.tsx    # Slide snapshots & OCR explainer
│       │   ├── LiveCaptionsTab.tsx # Live Chrome & Canvas caption stream
│       │   ├── AIAssistant.tsx     # Gemini multimodal chat & summaries
│       │   ├── ReviewNoteModal.tsx # Obsidian review modal with timeline & resume action
│       │   ├── Toolbar.tsx         # Quick action controls
│       │   └── SettingsModal.tsx   # Vault, API keys & templates config
│       └── styles/
│           └── theme.css           # Dark glassmorphic tokens & animations
├── utils/
│   ├── geminiClient.ts             # Gemini 3.8/2.0 multimodal vision & transcript API
│   ├── messaging.ts                # Type-safe extension message protocol
│   ├── noteMerge.ts                # Non-destructive vault merging & strict timestamp parsing
│   ├── templates.ts                # Cornell, lecture & flashcard templates
│   ├── transcriptExtractor.ts      # Canvas, Video.js & YouTube caption extractor & delta parser
│   └── vaultStorage.ts             # Local-first Obsidian vault file writer
├── tests/
│   ├── noteMerge.test.ts           # Tests for non-destructive merge & timestamp parsing
│   ├── utils.test.ts               # Vitest unit test suite (formatting, parsing, deduplication)
│   └── vaultStorage.test.ts        # Obsidian vault writer, Wikilink & attachment tests
├── wxt.config.ts                   # WXT Manifest V3 extension configuration
├── package.json                    # Project dependencies & scripts
├── GEMINI.md                       # Agent operating guide
└── README.md                       # Project documentation
```

---

## 🗺️ Roadmap

- [x] WXT Manifest V3 native side panel architecture
- [x] HTML5 canvas frame capture & direct Obsidian vault attachment writing
- [x] CORS-resilient screenshot fallback via `chrome.tabs.captureVisibleTab`
- [x] Gemini 3.8 / 2.0 Flash multimodal frame analysis, OCR & transcript summarization
- [x] Rich Markdown editor with live preview & inline clickable timestamp seeking
- [x] Global keyboard shortcuts (`Alt+S`, `Alt+T`, `Alt+P`)
- [x] Real-time Chrome Live Caption streaming bridge with delta-deduplication
- [x] Canvas LMS, Canvas Studio & Video.js iframe integration & subtitle scraping
- [x] Non-destructive vault file merge (preserves external edits, prevents overwriting)
- [x] Obsidian attachment rehydration across browser sessions
- [x] Real-time playhead seek tracking & persistent "Resume at [MM:SS]"
- [x] Review Note modal with chronological timestamp timeline & live markdown preview
- [x] Obsidian note templates (Cornell Notes, Lecture Notes, Flashcards Deck)
- [x] Real-time & periodic auto-saving directly to local Obsidian vault
- [ ] YouTube chapter & playlist auto-indexing
- [ ] Local video file playback workspace (`.mp4`, `.mkv`, `.webm`)

---

## 📜 License

MIT License © 2026 Helmi DH
