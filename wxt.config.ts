import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Video Notes (HoverNotes Re-engineered)',
    description: 'Capture video frames, timestamps, transcripts, and Markdown notes directly into your local Obsidian vault.',
    version: '0.1.0',
    permissions: ['sidePanel', 'storage', 'activeTab', 'scripting', 'tabs'],
    host_permissions: ['*://*/*', 'file://*/*'],
    action: {
      default_title: 'Open Video Notes Side Panel',
    },
    commands: {
      capture_frame: {
        suggested_key: {
          default: 'Alt+S',
          mac: 'Alt+S',
        },
        description: 'Capture current video frame',
      },
      insert_timestamp: {
        suggested_key: {
          default: 'Alt+T',
          mac: 'Alt+T',
        },
        description: 'Insert timestamp at cursor',
      },
      toggle_play: {
        suggested_key: {
          default: 'Alt+P',
          mac: 'Alt+P',
        },
        description: 'Toggle video play/pause',
      },
    },
  },
});
