# 🎬 Video Notes (HoverNotes Re-engineered)

> **Local-First, Multimodal AI Video Note-Taking Browser Extension for Obsidian & Markdown**

[![Chrome Extension](https://img.shields.io/badge/Chrome_MV3-Side_Panel-blue.svg)](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
[![WXT](https://img.shields.io/badge/Built_with-WXT-brightgreen.svg)](https://wxt.dev)
[![Gemini](https://img.shields.io/badge/AI-Gemini_3.8_Flash-orange.svg)](https://ai.google.dev/)
[![Obsidian Ready](https://img.shields.io/badge/PKM-Obsidian_Native-purple.svg)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Video Notes** bridges online video learning (YouTube, Coursera, Udemy, local lectures) with your Personal Knowledge Management (PKM) vault. It provides a distraction-free, side-by-side floating note workspace with 1-click video snapshots, interactive timestamps, multi-tier caption extraction, and multimodal AI analysis powered by Google Gemini.

---

## ✨ Key Features

- 📑 **Native Chrome Side Panel**: Docked right beside your video player. Zero window-juggling or tab-switching.
- ⏱️ **Interactive Timestamps**: Click any timestamp in your notes (`[04:21]`) to instantly seek the video to that exact second.
- 📸 **Timestamped Visual Snapshots**: Grab high-resolution slides, diagrams, and code snippets with `Alt+S` or 1-click. Saved automatically to your vault's `attachments/` folder.
- 💎 **Direct Obsidian Vault Sync**: Uses the **HTML5 File System Access API** (`showDirectoryPicker`) to save `.md` files and `.webp` attachments straight to your local Obsidian folder without any cloud intermediary.
- 🧠 **Multimodal AI Companion (Gemini 3.8 / 2.0 Flash)**:
  - **Frame Explainer & OCR**: Transcribes visible code, formulas, and diagrams into fenced Markdown blocks and Obsidian callouts (`> [!info]`).
  - **Structured Transcript Summaries**: Automatically turns video captions into comprehensive study notes with timestamped headings.
- ⌨️ **Keyboard-First Workflow**: Control playback, drop timestamps, and capture slides without taking your hands off the keyboard.
- 🛡️ **Privacy & Local-First**: Your notes, screenshots, and keys never touch 3rd-party servers. All requests go directly from your browser to Google AI Studio and your local disk.

---

## ⚡ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Alt + S` | Capture current video frame & insert into active note |
| `Alt + T` | Insert current timestamp `[MM:SS]` at cursor position |
| `Alt + Space` | Play / Pause active video |
| `Alt + J` / `Alt + L` | Jump backward / forward 5 seconds |

---

## 🛠️ Architecture & Tech Stack

- **Framework**: [WXT](https://wxt.dev) (Vite-powered Next-Gen Web Extension Framework)
- **Manifest**: Chromium Manifest V3 (`sidePanel`, `storage`, `activeTab`, `scripting`)
- **Frontend**: React 18/19, TypeScript, Lucide Icons
- **Styling**: Sleek Dark Glassmorphism (TailwindCSS / Modern CSS Custom Properties)
- **Storage**: Browser File System Access API + `idb-keyval` for persistent directory handles
- **AI Model**: Google Gemini 3.8 Flash / Gemini 3.8 Pro (`gemini-3.8-flash`)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and `npm` or `pnpm`
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
   ```

3. **Start WXT Development Server**:
   ```bash
   npm run dev
   ```
   *WXT will automatically build the extension and launch an isolated Chrome profile with the extension pre-loaded.*

4. **Load Manually in Your Primary Browser**:
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** (toggle in top-right corner).
   - Click **Load unpacked** and select the `.output/chrome-mv3` folder.
   - Open any YouTube video and click the **Video Notes** extension icon to launch the Side Panel.

5. **Connect Your Vault**:
   - In the Side Panel header, click **Select Local Vault** and choose your Obsidian vault folder.
   - Paste your **Gemini API Key** into the settings field (persisted locally).
   - Start watching videos, capturing slides, and taking notes!

---

## 📁 Repository Structure

```
video_notes_00/
├── .agents/                 # Agent rules, workflows, and task configs
├── entrypoints/
│   ├── background.ts       # Side panel trigger & background services
│   ├── content.ts          # Video player detection, seek & frame capture
│   └── sidepanel/          # React-based note-taking side panel UI
├── utils/
│   ├── geminiClient.ts     # Multimodal AI analysis & transcript summarizer
│   ├── messaging.ts        # Type-safe extension message protocol
│   ├── transcriptExtractor.ts # Multi-source caption extractor
│   └── vaultStorage.ts     # Local-first Obsidian vault file writer
├── wxt.config.ts           # WXT configuration
├── package.json            # Dependencies & scripts
├── GEMINI.md               # Agent operating guide
└── README.md               # Project documentation
```

---

## 🗺️ Roadmap

- [x] WXT Manifest V3 side panel architecture
- [x] HTML5 canvas frame capture & direct vault attachment writing
- [x] Gemini 2.5 Flash multimodal frame analysis & transcript summarization
- [ ] CORS-resilient screenshot capture via `chrome.tabs.captureVisibleTab`
- [ ] Rich Markdown editor with live preview & inline clickable timestamp seeking
- [ ] Global hotkeys (`Alt+S`, `Alt+T`, `Alt+Space`)
- [ ] YouTube chapter & playlist auto-indexing
- [ ] Local video file playback workspace (`.mp4`, `.mkv`, `.webm`)

---

## 📜 License

MIT License © 2026 Helmi DH
