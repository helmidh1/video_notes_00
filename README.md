# 🎬 Video Notes (HoverNotes Re-engineered)

> **Local-First, Multimodal AI Video Note-Taking Browser Extension for Obsidian & Markdown**

[![Chrome Extension](https://img.shields.io/badge/Chrome_MV3-Side_Panel-blue.svg)](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
[![WXT](https://img.shields.io/badge/Built_with-WXT-brightgreen.svg)](https://wxt.dev)
[![Gemini](https://img.shields.io/badge/AI-Gemini_3.8_Flash-orange.svg)](https://ai.google.dev/)
[![Obsidian Ready](https://img.shields.io/badge/PKM-Obsidian_Native-purple.svg)](https://obsidian.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Video Notes** bridges online lecture platforms (**Canvas LMS**, **Canvas Studio**, **YouTube**, **Coursera**, **Udemy**, and local lectures) directly with your Personal Knowledge Management (PKM) vault. It provides a distraction-free, side-by-side floating note workspace with 1-click video snapshots, interactive timestamps, live subtitle extraction, on-device Chrome Live Caption integration, and multimodal AI analysis powered by Google Gemini.

---

## 📑 Table of Contents

- [✨ Key Features](#-key-features)
- [🎯 Tailored for Your Use Case](#-tailored-for-your-use-case)
  - [1. University & Online Students](#1-university--online-students)
  - [2. Software Engineers & Tech Learners](#2-software-engineers--tech-learners)
  - [3. Obsidian & PKM Power Users](#3-obsidian--pkm-power-users)
  - [4. Researchers, Creators & Podcasters](#4-researchers-creators--podcasters)
- [⚡ Keyboard Shortcuts](#-keyboard-shortcuts)
- [🏗️ System Architecture](#️-system-architecture)
- [🚀 Quick Start & Installation](#-quick-start--installation)
  - [Prerequisites](#prerequisites)
  - [1. Clone & Install](#1-clone--install)
  - [2. Build the Extension](#2-build-the-extension)
  - [3. Load into Chromium Browser](#3-load-into-chromium-browser)
  - [4. Connect Your Obsidian Vault](#4-connect-your-obsidian-vault)
  - [5. Setup Free Google Gemini API Key](#5-setup-free-google-gemini-api-key)
- [🎙️ Subtitles & Live Captions Guide](#️-subtitles--live-captions-guide)
  - [Mode A: 100% In-Browser Subtitles & Voice Dictation](#mode-a-100-in-browser-subtitles--voice-dictation-zero-setup)
  - [Mode B: Desktop Chrome Live Caption Bridge (Optional)](#mode-b-desktop-chrome-live-caption-bridge-optional)
- [🧠 Multimodal AI Capabilities](#-multimodal-ai-capabilities)
- [📐 Note Templates](#-note-templates)
- [📁 Repository Structure](#-repository-structure)
- [🧪 Quality Gates & Testing](#-quality-gates--testing)
- [🗺️ Roadmap](#️-roadmap)
- [📜 License](#-license)

---

## ✨ Key Features

- 📑 **Native Chrome Side Panel**: Docked right beside your video player. Zero window-juggling or tab-switching.
- ⏱️ **Interactive Timestamps & Real-Time Sync**: Click any timestamp in your notes (`[04:21]`) to instantly seek the video to that exact second. Actively tracks video playhead across seeks, pauses, and page navigation with thumbnail-filtering heuristics.
- 🎯 **Accurate "Resume at [MM:SS]"**: Remembers where you stopped watching across sessions and browser refreshes (`chrome.storage.local`). Intelligently distinguishes between current playhead, saved watch progress, and the latest written note timestamp while isolating frontmatter dates.
- 📸 **Timestamped Visual Snapshots**: Grab high-resolution slides, diagrams, and code snippets with `Alt+S` or 1-click. Saved automatically to your vault's attachments folder (`attachments/`) as lightweight `.webp` images.
- 🎙️ **Standalone In-Browser Captions & Live Dictation**: Streams live subtitles from **YouTube** (with automatic CC activation), **Coursera**, **Udemy**, and **Canvas LMS** directly into your notes without needing any external server or terminal script. Includes browser-native **Live Voice Dictation** powered by the Web Speech API for hands-free speech-to-text.
- 🎓 **Canvas LMS & Video.js Support**: Deep integration with Canvas LMS course pages, Canvas Studio embeds, and Video.js players across nested iframes with accurate time sync and closed-caption scraping.
- 📝 **Dual Edit & Live Preview Editor**: Split-mode Markdown editor with live image rendering, clickable timestamp anchors, and built-in note templates (Cornell Notes, Lecture Notes, Obsidian Flashcards Deck).
- 💎 **Non-Destructive Vault Sync & Direct Obsidian Saving**: Uses the **HTML5 File System Access API** (`showDirectoryPicker`) to save `.md` files and `.webp` attachments straight to your local Obsidian folder from the extension itself without any cloud intermediary. Features intelligent **non-destructive merging** with zero data loss, interactive 1-click vault connection, toolbar shortcut to **Open in Obsidian** (`obsidian://open`), and 1-click Markdown export.
- 🔄 **Instant Startup & Tab Synchronization**: Automatically syncs with the active tab on startup and tab switching (`chrome.tabs.onActivated`, `onUpdated`), instantly loading the note corresponding to whatever lecture video you are watching.
- 🔍 **Review Note & Timestamps Timeline**: Dedicated Review modal and top banner strip displaying all timestamps noted in your Obsidian file. Search note text, preview rendered Markdown, copy snippet blocks, or hit **"Resume at [MM:SS]"** to instantly continue the lecture where you previously left off. Rehydrates past frame attachments from disk across refreshes.
- 🧠 **Multimodal AI Companion (Gemini 3.8 / 2.0 Flash)**:
  - **Frame Explainer & OCR**: Transcribes visible code, formulas, and diagrams into fenced Markdown blocks and Obsidian callouts (`> [!info]`).
  - **Structured Transcript Summaries**: Automatically turns video captions into comprehensive study notes with timestamped headings.
  - **Context-Aware Study Chat**: Ask questions directly about lecture slides, transcript, and active notes.
- ⌨️ **Keyboard-First Workflow**: Control playback (`Alt+P`), drop timestamps (`Alt+T`), and capture slides (`Alt+S`) without taking your hands off the keyboard.
- 🛡️ **Privacy & Local-First**: Your notes, screenshots, and keys never touch 3rd-party servers. All requests go directly from your browser to Google AI Studio and your local disk.

---

## 🎯 Tailored for Your Use Case

### 1. University & Online Students
- **Follow lectures without pausing**: Dock Video Notes directly beside Canvas Studio, Coursera, or YouTube lectures.
- **Cornell Note System**: Select the built-in Cornell template to separate lecture cues, detailed notes, and end-of-lecture summaries.
- **Instant Spaced Repetition**: Select the **Flashcards Deck** template to format key concepts into ready-to-use Obsidian / Anki flashcards as the professor speaks.
- **Clickable Study Review**: When preparing for exams, open your note in Obsidian or inside the Side Panel's **Review Modal** and click any timestamp to jump right back to that point in the lecture.

### 2. Software Engineers & Tech Learners
- **Capture code from screencasts**: Hit `Alt+S` on code slides or terminal demos.
- **Instant AI OCR**: Click **"Analyze Frame"** to transcribe screenshot code into clean, syntax-highlighted Markdown code blocks.
- **Interactive Seek Anchors**: Click timestamps in code explanations to rewatch the instructor explain the implementation.

### 3. Obsidian & PKM Power Users
- **100% Local File System Access**: Direct disk access via the HTML5 File System Access API. Zero sync lag, zero lock-in, zero cloud servers.
- **Standard Obsidian Conventions**:
  - Wikilinks for images: `![[attachments/frame_04_21.webp]]`
  - Obsidian Callouts: `> [!info] AI Analysis`
  - Dataview-compatible YAML frontmatter with `title`, `url`, `tags`, `created`, `updated`, and `last_timestamp`.
- **Non-Destructive Merge**: Edit notes freely inside Obsidian desktop; Video Notes intelligently appends new timestamps and slides without overwriting your manual edits.

### 4. Researchers, Creators & Podcasters
- **Video Podcast & Interview Transcripts**: Stream continuous subtitles with smart pause chunking (2.0s debounce) to produce clean, sentence-aligned reading notes.
- **Hands-Free Voice Dictation**: Click **Dictate** (`🎙️`) to speak observations, thesis notes, and thoughts directly into your timestamped note.

---

## ⚡ Keyboard Shortcuts

Work seamlessly without taking your fingers off the keyboard:

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| `Alt + S` | **Capture Frame** | Takes a screenshot of the video, writes `.webp` to vault, inserts Wikilink into note |
| `Alt + T` | **Insert Timestamp** | Inserts clickable `[MM:SS]` anchor at cursor linked to current playback |
| `Alt + P` | **Play / Pause Video** | Toggles video playback without losing editor focus |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CHROMIUM BROWSER                               │
│                                                                             │
│  ┌───────────────────────────────┐     ┌─────────────────────────────────┐  │
│  │     ACTIVE LECTURE TAB        │     │       NATIVE SIDE PANEL         │  │
│  │   (YouTube / Canvas LMS)      │     │         (React 18 UI)           │  │
│  │                               │     │                                 │  │
│  │   ┌───────────────────────┐   │     │  ┌───────────────────────────┐  │  │
│  │   │     <video> Player    │   │     │  │  Dual Markdown Editor     │  │  │
│  │   └───────────┬───────────┘   │     │  │  & Live Preview           │  │  │
│  │               │               │     │  └─────────────┬─────────────┘  │  │
│  │   ┌───────────▼───────────┐   │     │  ┌─────────────▼─────────────┐  │  │
│  │   │ Content Script        │◄──┼─────┼──┤ Timestamp & Seek Sync     │  │  │
│  │   │ • Subtitle scraper    │   │ MSG │  └─────────────┬─────────────┘  │  │
│  │   │ • Canvas / Tab capture│───┼─────┼──┤ Frame Gallery & Review    │  │  │
│  │   │ • Time tracking       │   │     │  └─────────────┬─────────────┘  │  │
│  └───────────────────────────────┘     └────────────────┼────────────────┘  │
│                                                         │                   │
│                                        ┌────────────────▼────────────────┐  │
│                                        │  Background Service Worker      │  │
│                                        │  • VisibleTab CORS fallback     │  │
│                                        │  • Context & tab coordination   │  │
│                                        └────────────────┬────────────────┘  │
└─────────────────────────────────────────────────────────┼───────────────────┘
                                                          │
                              ┌───────────────────────────┴────────────────┐
                              │                                            │
                              ▼                                            ▼
              ┌──────────────────────────────┐              ┌──────────────────────────────┐
              │      GOOGLE GEMINI API       │              │     LOCAL OBSIDIAN VAULT     │
              │   (@google/genai SDK)        │              │  (File System Access API)    │
              │                              │              │                              │
              │ • Frame OCR & Vision         │              │ • Non-destructive .md merge  │
              │ • Structured Summaries       │              │ • attachments/*.webp frames  │
              │ • Multimodal Study Chat      │              │ • obsidian://open deep link  │
              └──────────────────────────────┘              └──────────────────────────────┘
```

---

## 🚀 Quick Start & Installation

### Prerequisites
- Node.js 18+ and `npm`
- Google Chrome, Brave, or Microsoft Edge (Chromium 114+ with Side Panel support)
- [Obsidian](https://obsidian.md/) (Free local note-taking app)
- A free Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/)

---

### 1. Clone & Install

```bash
git clone https://github.com/your-username/video-notes.git
cd video-notes
npm install
```

### 2. Build the Extension

Run the production build:
```bash
npm run build
```
*Outputs a clean, bundled Manifest V3 extension in `.output/chrome-mv3`.*

*(For live hot-reloading during development, run `npm run dev` instead).*

### 3. Load into Chromium Browser

1. Open your browser and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** on (top-right switch).
3. Click **Load unpacked** (top-left button).
4. Select the `.output/chrome-mv3` folder inside the project directory.
5. Pin the **Video Notes** extension icon to your toolbar.

### 4. Connect Your Obsidian Vault

1. Open any lecture video on **YouTube**, **Canvas LMS**, **Coursera**, or **Udemy**.
2. Click the **Video Notes** toolbar icon to open the Side Panel docked alongside your video.
3. Click **📁 Connect Vault** (in the toolbar or Settings `⚙️`).
4. Select your local Obsidian vault folder (e.g., your local notes folder or Obsidian vault directory).
5. Grant permission when the browser asks to allow read/write access.

### 5. Setup Free Google Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/) and click **Get API key** (free tier: 15 RPM, 1M TPM).
2. In the Side Panel, click **Settings (`⚙️`)**.
3. Paste your key into the **Gemini API Key** field and select your model (`gemini-3.8-flash` recommended).
4. Click **Done**. Your key is securely stored in local extension storage.

---

## 🎙️ Subtitles & Live Captions Guide

Video Notes provides two ways to capture lecture speech:

### Mode A: 100% In-Browser Subtitles & Voice Dictation (Zero-Setup)
- **Automatic Subtitle Scraping**: On YouTube, Canvas LMS, Coursera, or Udemy, open the **Captions** tab in the side panel. Subtitles stream automatically in real-time with clickable timestamps.
- **Smart Pause Chunking**: Subtitles use an intelligent 2.0s sentence-boundary debounce to avoid chopped words or duplicate phrases.
- **Live Voice Dictation**: Click **Dictate** (`🎙️`) to use your browser's speech recognition to transcribe your own voice notes or lecture audio directly into the active document.

### Mode B: Desktop Chrome Live Caption Bridge (Optional)
If a video platform does not provide closed captions or text tracks, you can capture speech on-device using Chrome's built-in Live Captions:
1. Enable Live Caption in Chrome: `chrome://settings/captions` -> toggle **Live Caption** ON.
2. Ensure Python 3.10+ is installed:
   ```bash
   pip install uiautomation websockets
   ```
3. Run the companion bridge:
   ```bash
   npm run caption-bridge
   # Or double click companion/run_bridge.bat on Windows
   ```
4. The side panel will auto-connect to `ws://localhost:8765`, streaming system captions with rolling-bubble alignment and 4.0s pause flushes.

---

## 🧠 Multimodal AI Capabilities

Video Notes utilizes `@google/genai` to analyze visual slides and lecture audio:

- **Slide OCR & Explanation**:
  When you capture a frame with `Alt+S`, click **Analyze Frame** in the Frame Gallery. Gemini extracts:
  - Fenced code snippets (Python, TypeScript, C++, SQL, etc.)
  - Mathematical formulas (KaTeX / LaTeX format)
  - Key concepts structured in an Obsidian callout:
    ```markdown
    > [!info] AI Frame Analysis (04:21)
    > **Key Concept**: Fast-Forward Merge vs 3-Way Merge
    > ```bash
    > git merge --ff-only feature-branch
    > ```
    ```
- **Transcript Summarization**:
  Click **Summarize** in the AI Assistant tab to generate a structured study guide with headings, bullet points, and key takeaways.
- **Context-Aware Study Assistant**:
  Chat with the AI about specific slide contents, code snippets, or lecture topics.

---

## 📐 Note Templates

Switch note templates with one click in **Settings (`⚙️`)**:

| Template | Ideal For | Format Structure |
| :--- | :--- | :--- |
| **Standard Note** | General screencasts & webinars | Frontmatter, Overview, Notes & Snapshots, Summary |
| **Cornell Notes** | University lectures & deep learning | Cues / Keywords column, Notes with Timestamps, Summary |
| **Structured Lecture** | Technical courses & certifications | Objectives, Key Terminology, Lecture Sections, Code & Snapshots, Review Questions |
| **Flashcards Deck** | Exam prep & Spaced Repetition | Obsidian Spaced Repetition / Anki ready (`Question::Answer` & `Front #flashcard Back`) |

---

## 📁 Repository Structure

```
video-notes/
├── .agents/                        # Agent customization skills & rules
│   ├── rules/                      # MV3 extension architecture rules
│   └── skills/                     # Workspace skills (git-commit-push, update-docs, etc.)
├── companion/                      # Optional Chrome Live Caption desktop bridge
│   ├── caption_bridge.py           # Windows UIA live caption WebSocket server (ws://localhost:8765)
│   ├── test_caption_bridge.py      # Unit tests for UIA window filtering & delta extraction
│   └── run_bridge.bat              # Quick start batch launcher
├── entrypoints/
│   ├── background.ts               # Side Panel behavior, CORS screenshot fallback handler
│   ├── content.ts                  # Multi-video player detector, DOM observer, timestamp sync
│   └── sidepanel/                  # React note-taking workspace
│       ├── App.tsx                 # Core sidepanel state, live playhead banner & vault loader
│       ├── index.html              # Side panel HTML container
│       ├── main.tsx                # React mount entrypoint
│       ├── components/
│       │   ├── Editor.tsx          # Markdown editor with timestamp hotkeys & live preview
│       │   ├── FrameGallery.tsx    # Slide snapshots with OCR, Explain, and Seek actions
│       │   ├── LiveCaptionsTab.tsx # Source-isolated caption stream & Web Speech dictation
│       │   ├── AIAssistant.tsx     # Gemini multimodal chat & transcript summarizer
│       │   ├── ReviewNoteModal.tsx # Obsidian review modal with chronological timeline & resume action
│       │   ├── Toolbar.tsx         # Scrollable quick action bar & Obsidian export controls
│       │   └── SettingsModal.tsx   # Obsidian vault connector & API configuration
│       └── styles/
│           └── theme.css           # Dark glassmorphic tokens & typography
├── utils/
│   ├── geminiClient.ts             # Gemini 3.8/2.0 multimodal vision & transcript API
│   ├── messaging.ts                # Type-safe extension message definitions
│   ├── noteMerge.ts                # Non-destructive vault merging & attachment rehydration
│   ├── templates.ts                # Cornell, lecture & flashcard templates
│   ├── transcriptExtractor.ts      # Multi-tier caption extractor (textTracks, YouTube DOM, Canvas)
│   └── vaultStorage.ts             # Obsidian vault writer, Wikilink generator, image saver
├── tests/
│   ├── noteMerge.test.ts           # Non-destructive merge & timestamp tests
│   ├── utils.test.ts               # Unit tests (formatting, parsing, deduplication)
│   └── vaultStorage.test.ts        # Obsidian vault writer, Wikilink & attachment tests
├── wxt.config.ts                   # WXT Manifest V3 extension configuration
├── tsconfig.json                   # Strict TypeScript configuration
├── package.json                    # Project dependencies and build scripts
├── GEMINI.md                       # Agent operating guide
└── README.md                       # Public-facing documentation
```

---

## 🧪 Quality Gates & Testing

To maintain stability across Chromium updates and video platform changes, this project runs an automated test suite:

```bash
# Run Vitest unit tests (37 tests across note merging, vault storage, and caption extraction)
npm test

# Run strict TypeScript typecheck
npx tsc --noEmit

# Run Companion Bridge unit tests
python companion/test_caption_bridge.py

# Verify production build
npm run build
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
- [x] Standalone in-browser live captioning & Web Speech voice dictation
- [x] Canvas LMS, Canvas Studio & Video.js iframe integration & subtitle scraping
- [x] Non-destructive vault file merge (preserves external edits, prevents overwriting)
- [x] Direct Obsidian URI protocol integration (`obsidian://open`) & 1-click Markdown export
- [x] Obsidian attachment rehydration across browser sessions
- [x] Real-time playhead seek tracking & persistent "Resume at [MM:SS]"
- [x] Review Note modal with chronological timestamp timeline & live markdown preview
- [x] Horizontally scrollable glassmorphic toolbar with mouse wheel navigation
- [x] Continuous background caption processing across side panel tabs
- [x] Obsidian note templates (Cornell Notes, Lecture Notes, Flashcards Deck)
- [x] Real-time & periodic auto-saving directly to local Obsidian vault
- [ ] YouTube chapter & playlist auto-indexing
- [ ] Local video file playback workspace (`.mp4`, `.mkv`, `.webm`)

---

## 📜 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

Copyright © 2026 Video Notes Contributors.
