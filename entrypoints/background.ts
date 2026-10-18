import { normalizeSessionUrl } from '../utils/sessionManager';

export default defineBackground(() => {
  // Configure side panel to open when extension icon is clicked
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Failed to set side panel behavior:', error));

  // In-memory set of currently audible tabs
  const audibleTabs = new Set<number>();

  // 1. Listen for active tab switching
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab?.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        const { sessionKey } = normalizeSessionUrl(tab.url);
        chrome.runtime.sendMessage({
          type: 'ACTIVE_TAB_CHANGED',
          tabId: activeInfo.tabId,
          url: tab.url,
          title: tab.title || 'Video Notes',
          sessionKey,
        }).catch(() => {
          // Side panel might not be open
        });
      }
    } catch {
      // Tab might have closed
    }
  });

  // 2. Listen for URL navigations and audible audio changes
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.audible !== undefined) {
      if (changeInfo.audible) {
        audibleTabs.add(tabId);
      } else {
        audibleTabs.delete(tabId);
      }
      const sessionKey = tab.url ? normalizeSessionUrl(tab.url).sessionKey : undefined;
      chrome.runtime.sendMessage({
        type: 'AUDIBLE_TAB_CHANGED',
        tabId,
        audible: changeInfo.audible,
        sessionKey,
      }).catch(() => {});
    }

    if (changeInfo.url && !changeInfo.url.startsWith('chrome://') && !changeInfo.url.startsWith('chrome-extension://')) {
      const { sessionKey } = normalizeSessionUrl(changeInfo.url);
      chrome.runtime.sendMessage({
        type: 'ACTIVE_TAB_CHANGED',
        tabId,
        url: changeInfo.url,
        title: tab.title || 'Video Notes',
        sessionKey,
      }).catch(() => {});
    }
  });

  // 3. Clean up closed tabs
  chrome.tabs.onRemoved.addListener((tabId) => {
    audibleTabs.delete(tabId);
  });

  // 4. Handle global keyboard shortcuts defined in manifest commands
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

  // 5. Handle runtime messages (e.g., CORS fallback screenshot capture, audible queries)
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

    if (message.type === 'GET_AUDIBLE_TAB') {
      const activeAudibleId = audibleTabs.values().next().value;
      sendResponse({ ok: true, audibleTabId: activeAudibleId || null });
      return false;
    }

    return false;
  });
});
