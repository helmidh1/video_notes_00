export default defineBackground(() => {
  // Configure side panel to open when extension icon is clicked
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Failed to set side panel behavior:', error));

  // Handle global keyboard shortcuts defined in manifest commands
  chrome.commands.onCommand.addListener(async (command) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      // Broadcast hotkey command to active tab content script and side panel
      await chrome.tabs.sendMessage(tab.id, {
        type: 'HOTKEY_COMMAND',
        command,
      }).catch(() => {
        // Content script might not be active on system pages
      });

      chrome.runtime.sendMessage({
        type: 'HOTKEY_COMMAND',
        command,
      }).catch(() => {
        // Side panel might not be open
      });
    } catch (err) {
      console.warn('Hotkey broadcast failed:', err);
    }
  });

  // Handle runtime messages (e.g., CORS fallback screenshot capture)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CAPTURE_VISIBLE_TAB') {
      const windowId = sender.tab?.windowId;
      const options = { format: 'png' as const };
      const capturePromise = windowId !== undefined
        ? chrome.tabs.captureVisibleTab(windowId, options)
        : chrome.tabs.captureVisibleTab(options);

      capturePromise
        .then((dataUrl) => {
          sendResponse({ ok: true, dataUrl });
        })
        .catch((err) => {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : 'captureVisibleTab failed' });
        });
      return true; // Keep message channel open for async response
    }
    return false;
  });
});
