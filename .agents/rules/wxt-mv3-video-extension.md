# WXT MV3 Video Extension Rules

- Use WXT (`wxt.config.ts`) to manage `manifest.json` generation for Chromium Manifest V3.
- Keep `entrypoints/background.ts` stateless; store session or persistent values in `chrome.storage` or IndexedDB.
- Call `window.showDirectoryPicker` only from the Side Panel (`chrome-extension://` origin) and store the `FileSystemDirectoryHandle` in IndexedDB via `idb-keyval`.
- Re-query `<video>` elements dynamically inside `entrypoints/content.ts` message handlers to support Single Page Application (SPA) navigation.
- When capturing frames from cross-origin streams (e.g. YouTube), attempt direct 2D canvas extraction first; fallback to `chrome.tabs.captureVisibleTab` if canvas is tainted.
