import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Radio,
  Play,
  Pause,
  Trash2,
  FilePlus,
  Copy,
  Sparkles,
  HelpCircle,
  ExternalLink,
  Check,
  Search,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { ExtensionMessage, LiveCaptionItem, VideoStateResponse } from '../../../utils/messaging';
import { formatSeconds, extractDeltaText } from '../../../utils/transcriptExtractor';

interface LiveCaptionsTabProps {
  onInsertIntoNotes: (text: string) => void;
  onSeek: (timestamp: number) => void;
  pageUrl: string;
  linkedTabId?: number;
  linkedUrl?: string;
  captionItems?: LiveCaptionItem[];
  onUpdateCaptionItems?: (items: LiveCaptionItem[]) => void;
  onSummarizeWithAI: (transcript: string) => void;
  onOpenSettings: () => void;
}

export const LiveCaptionsTab: React.FC<LiveCaptionsTabProps> = ({
  onInsertIntoNotes,
  onSeek,
  pageUrl,
  linkedTabId,
  linkedUrl,
  captionItems: externalCaptionItems,
  onUpdateCaptionItems,
  onSummarizeWithAI,
  onOpenSettings,
}) => {
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'connecting' | 'web-only' | 'disconnected'
  >('connecting');
  const [bridgeSource, setBridgeSource] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(true);
  const [autoAppend, setAutoAppend] = useState(false);
  const [activeLiveText, setActiveLiveText] = useState('');
  const [internalCaptionItems, setInternalCaptionItems] = useState<LiveCaptionItem[]>([]);
  const captionItems = externalCaptionItems !== undefined ? externalCaptionItems : internalCaptionItems;

  const setCaptionItems = (updater: LiveCaptionItem[] | ((prev: LiveCaptionItem[]) => LiveCaptionItem[])) => {
    if (typeof updater === 'function') {
      const next = updater(captionItems);
      if (onUpdateCaptionItems) onUpdateCaptionItems(next);
      setInternalCaptionItems(next);
    } else {
      if (onUpdateCaptionItems) onUpdateCaptionItems(updater);
      setInternalCaptionItems(updater);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastCommittedTextRef = useRef<string>('');
  const accumulatedTextRef = useRef<string>('');

  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;
  const autoAppendRef = useRef(autoAppend);
  autoAppendRef.current = autoAppend;
  const pageUrlRef = useRef(pageUrl);
  pageUrlRef.current = pageUrl;
  const linkedTabIdRef = useRef(linkedTabId);
  linkedTabIdRef.current = linkedTabId;
  const linkedUrlRef = useRef(linkedUrl);
  linkedUrlRef.current = linkedUrl;

  // Reset rolling text buffer when session tab link changes
  useEffect(() => {
    setActiveLiveText('');
    lastCommittedTextRef.current = '';
    accumulatedTextRef.current = captionItems.map((c) => c.text).join(' ');
  }, [linkedTabId, linkedUrl]);

  const lastKnownVideoTimeRef = useRef<{ timestamp: number; formattedTime: string }>({
    timestamp: 0,
    formattedTime: '00:00',
  });

  // Fetch current video timestamp from content script (with iframe support)
  async function getCurrentVideoTime(): Promise<{ timestamp: number; formattedTime: string }> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const state = await chrome.tabs.sendMessage<ExtensionMessage, VideoStateResponse>(tab.id, {
          type: 'GET_VIDEO_STATE',
        });
        if (state?.ok && state.currentTime !== undefined) {
          const res = {
            timestamp: state.currentTime,
            formattedTime: state.formattedTime || formatSeconds(state.currentTime),
          };
          lastKnownVideoTimeRef.current = res;
          return res;
        }
      }
    } catch {
      // Content script not accessible or not on video page
    }
    return lastKnownVideoTimeRef.current;
  }

  // Auto-scroll to bottom of live transcript stream
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [captionItems, activeLiveText]);

  // Connect to Chrome Live Caption Bridge (ws://127.0.0.1:8765) once on mount
  useEffect(() => {
    let isMounted = true;

    function connectBridge() {
      if (!isMounted) return;
      setConnectionStatus('connecting');

      try {
        const ws = new WebSocket('ws://127.0.0.1:8765');
        socketRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setConnectionStatus('connected');
        };

        ws.onmessage = async (evt) => {
          if (!isMounted || !isRecordingRef.current) return;
          try {
            const data = JSON.parse(evt.data);

            if (data.type === 'SOURCE_ATTACHED') {
              setBridgeSource(data.source);
            } else if (data.type === 'SOURCE_DETACHED') {
              setBridgeSource(null);
            } else if (data.type === 'CAPTION_UPDATE') {
              const text = (data.text || '').trim();
              if (!text) return;

              // Extract only the newly spoken delta (avoid repeating prior rolling sentences)
              const delta = data.delta ? data.delta.trim() : extractDeltaText(accumulatedTextRef.current, text);
              if (delta) {
                setActiveLiveText(delta);
              }

              // Commit sentence when ended with punctuation or explicitly finalized
              const isSentenceEnd = data.isFinal || /[.?!]$/.test(text) || (delta && /[.?!]$/.test(delta));
              if (isSentenceEnd && delta && delta.length > 1 && text !== lastCommittedTextRef.current) {
                accumulatedTextRef.current += (accumulatedTextRef.current ? ' ' : '') + delta;
                lastCommittedTextRef.current = text;
                const { timestamp, formattedTime } = await getCurrentVideoTime();

                const newItem: LiveCaptionItem = {
                  id: crypto.randomUUID(),
                  text: delta,
                  timestamp,
                  formattedTime,
                  isFinal: true,
                  source: 'chrome-live-caption',
                };

                setCaptionItems((prev) => [...prev, newItem]);
                setActiveLiveText('');

                if (autoAppendRef.current) {
                  const line = `\n- [${formattedTime}](${pageUrlRef.current}#t=${Math.floor(timestamp)}s) ${delta}`;
                  onInsertIntoNotes(line);
                }
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          socketRef.current = null;
          setConnectionStatus((prev) => (prev === 'web-only' ? 'web-only' : 'disconnected'));
          setBridgeSource(null);

          // Retry connection after 3.5s
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMounted) connectBridge();
          }, 3500);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        setConnectionStatus('disconnected');
      }
    }

    connectBridge();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  // Start in-browser closed caption fallback observer
  useEffect(() => {
    let isMounted = true;

    async function initWebCaptionObserver() {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs.sendMessage<ExtensionMessage>(tab.id, {
            type: 'START_LIVE_CAPTIONS',
          });
        }
      } catch {
        // Tab not ready
      }
    }

    initWebCaptionObserver();

    // Listen for captions emitted by content script
    const webCaptionListener = (msg: ExtensionMessage, sender?: chrome.runtime.MessageSender) => {
      if (!isMounted || !isRecordingRef.current) return;
      if (msg.type === 'LIVE_WEB_CAPTION' && msg.text) {
        // Tab-specific isolation: ignore captions from other tabs
        const senderTabId = sender?.tab?.id ?? msg.tabId;
        const senderUrl = sender?.tab?.url ?? msg.pageUrl;

        if (linkedTabIdRef.current && senderTabId && senderTabId !== linkedTabIdRef.current) {
          return;
        }

        if (linkedUrlRef.current && senderUrl) {
          const cleanLinked = linkedUrlRef.current.split('#')[0].replace(/[?&]t=\d+s?/, '');
          const cleanSender = senderUrl.split('#')[0].replace(/[?&]t=\d+s?/, '');
          if (cleanLinked && cleanSender && cleanLinked !== cleanSender) {
            return;
          }
        }

        // If bridge is not connected, set status to web-only
        if (connectionStatus === 'disconnected' || connectionStatus === 'connecting') {
          setConnectionStatus('web-only');
        }

        const clean = msg.text.trim();
        const delta = extractDeltaText(accumulatedTextRef.current, clean);
        if (delta && delta.length > 1 && clean !== lastCommittedTextRef.current) {
          accumulatedTextRef.current += (accumulatedTextRef.current ? ' ' : '') + delta;
          lastCommittedTextRef.current = clean;
          lastKnownVideoTimeRef.current = {
            timestamp: msg.timestamp,
            formattedTime: msg.formattedTime,
          };
          const newItem: LiveCaptionItem = {
            id: crypto.randomUUID(),
            text: delta,
            timestamp: msg.timestamp,
            formattedTime: msg.formattedTime,
            isFinal: true,
            source: 'web-caption',
            tabId: senderTabId,
          };

          setCaptionItems((prev) => [...prev, newItem]);

          if (autoAppendRef.current) {
            const line = `\n- [${msg.formattedTime}](${pageUrlRef.current}#t=${Math.floor(msg.timestamp)}s) ${delta}`;
            onInsertIntoNotes(line);
          }
        }
      }
    };

    chrome.runtime.onMessage.addListener(webCaptionListener);

    return () => {
      isMounted = false;
      chrome.runtime.onMessage.removeListener(webCaptionListener);
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id) {
          chrome.tabs.sendMessage<ExtensionMessage>(tab.id, {
            type: 'STOP_LIVE_CAPTIONS',
          }).catch(() => {});
        }
      });
    };
  }, [isRecording, autoAppend, connectionStatus, pageUrl]);

  // Actions
  function handleInsertAllIntoNotes() {
    if (captionItems.length === 0) return;

    let markdown = `\n\n### 🎙️ Live Transcript\n`;
    for (const item of captionItems) {
      const link = pageUrl ? `[${item.formattedTime}](${pageUrl}#t=${Math.floor(item.timestamp)}s)` : `[${item.formattedTime}]`;
      markdown += `- ${link} ${item.text}\n`;
    }
    markdown += `\n`;

    onInsertIntoNotes(markdown);
  }

  function handleCopyAll() {
    if (captionItems.length === 0) return;
    const plainText = captionItems
      .map((item) => `[${item.formattedTime}] ${item.text}`)
      .join('\n');
    navigator.clipboard.writeText(plainText);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
  }

  function handleClear() {
    setCaptionItems([]);
    setActiveLiveText('');
    lastCommittedTextRef.current = '';
    accumulatedTextRef.current = '';
  }

  function handleSummarizeWithGemini() {
    if (captionItems.length === 0) return;
    const fullTranscript = captionItems
      .map((item) => `[${item.formattedTime}] ${item.text}`)
      .join('\n');
    onSummarizeWithAI(fullTranscript);
  }

  // Filtered caption items
  const filteredItems = captionItems.filter((item) =>
    item.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      {/* Top Status & Controls Header */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '10px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {connectionStatus === 'connected' ? (
              <span className="badge badge-connected" title="Connected to Chrome Live Caption Bridge">
                <span className="pulse-indicator" style={{ background: '#34d399' }} />
                <span>Live Caption Bridge</span>
              </span>
            ) : connectionStatus === 'web-only' ? (
              <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee', borderColor: 'rgba(6, 182, 212, 0.3)' }} title="Capturing in-page video subtitles">
                <Radio size={11} />
                <span>In-Page Subtitles</span>
              </span>
            ) : connectionStatus === 'connecting' ? (
              <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                <Wifi size={11} />
                <span>Connecting Bridge...</span>
              </span>
            ) : (
              <span className="badge badge-disconnected" title="Bridge not running">
                <WifiOff size={11} />
                <span>Bridge Offline</span>
              </span>
            )}

            {bridgeSource && (
              <span style={{ fontSize: '10.5px', color: 'var(--text-subtle)' }}>
                ({bridgeSource})
              </span>
            )}
          </div>

          <button
            className="btn btn-icon"
            onClick={() => setShowSetupModal(true)}
            title="Chrome Live Caption Setup Guide"
            style={{ padding: '4px' }}
          >
            <HelpCircle size={14} color="var(--accent-primary)" />
          </button>
        </div>

        {/* Action Buttons Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <button
              className={`btn ${isRecording ? 'btn-primary' : ''}`}
              onClick={() => setIsRecording(!isRecording)}
              title={isRecording ? 'Pause Live Transcription' : 'Resume Live Transcription'}
              style={{ fontSize: '11px', padding: '4px 8px' }}
            >
              {isRecording ? <Pause size={12} /> : <Play size={12} />}
              <span>{isRecording ? 'Recording' : 'Paused'}</span>
            </button>

            <button
              className="btn"
              onClick={handleInsertAllIntoNotes}
              disabled={captionItems.length === 0}
              title="Insert entire live transcript into Markdown note"
              style={{ fontSize: '11px', padding: '4px 8px' }}
            >
              <FilePlus size={12} />
              <span>Insert ({captionItems.length})</span>
            </button>

            <button
              className="btn"
              onClick={handleSummarizeWithGemini}
              disabled={captionItems.length === 0}
              title="Summarize live transcript with Gemini AI"
              style={{ fontSize: '11px', padding: '4px 8px' }}
            >
              <Sparkles size={12} color="#8b5cf6" />
              <span>AI Summarize</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              className="btn btn-icon"
              onClick={handleCopyAll}
              disabled={captionItems.length === 0}
              title="Copy all captions to clipboard"
            >
              {copiedSuccess ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
            </button>

            <button
              className="btn btn-icon"
              onClick={handleClear}
              disabled={captionItems.length === 0 && !activeLiveText}
              title="Clear live transcript buffer"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Auto-append Toggle & Search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '11px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={autoAppend}
              onChange={(e) => setAutoAppend(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Auto-append to Notes</span>
          </label>

          <div style={{ position: 'relative', width: '130px' }}>
            <Search size={11} style={{ position: 'absolute', left: '6px', top: '7px', color: 'var(--text-subtle)' }} />
            <input
              type="text"
              placeholder="Search..."
              className="input-field"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: '3px 6px 3px 22px', fontSize: '11px' }}
            />
          </div>
        </div>
      </div>

      {/* Main Transcript Feed */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {captionItems.length === 0 && !activeLiveText && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              gap: '10px',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'var(--bg-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Mic size={20} color="var(--accent-primary)" />
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>Listening for Live Captions</p>
              <p style={{ fontSize: '11.5px', marginTop: '4px', color: 'var(--text-subtle)', lineHeight: 1.4 }}>
                Play any video or audio in Chrome with <b>Chrome Live Caption</b> enabled. Real-time words will appear here automatically.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setShowSetupModal(true)}
              style={{ fontSize: '11px', marginTop: '6px' }}
            >
              View Quick Setup Guide
            </button>
          </div>
        )}

        {/* Committed Transcript Items */}
        {filteredItems.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              fontSize: '12px',
              lineHeight: 1.45,
            }}
          >
            <button
              className="badge"
              onClick={() => onSeek(item.timestamp)}
              title={`Jump video to ${item.formattedTime}`}
              style={{
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '10.5px',
                padding: '1px 6px',
                border: 'none',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#a5b4fc',
              }}
            >
              {item.formattedTime}
            </button>
            <span style={{ flex: 1, color: 'var(--text-main)' }}>{item.text}</span>
          </div>
        ))}

        {/* Active Streaming (Pulsing) Sentence */}
        {activeLiveText && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px dashed var(--accent-primary)',
              fontSize: '12px',
              lineHeight: 1.45,
            }}
          >
            <span className="pulse-indicator" style={{ background: 'var(--accent-primary)', marginTop: '5px' }} />
            <span style={{ flex: 1, color: '#e0e7ff', fontStyle: 'italic' }}>
              {activeLiveText}
              <span className="pulse-indicator" style={{ background: '#fff', marginLeft: '4px', verticalAlign: 'middle' }} />
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Setup Guide Modal */}
      {showSetupModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(6px)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '380px',
              background: 'var(--bg-secondary)',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>Chrome Live Caption Setup</h3>
              <button className="btn btn-icon" onClick={() => setShowSetupModal(false)}>
                ✕
              </button>
            </div>

            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Chrome generates real-time speech captions on-device for any playing media. Because Chrome renders captions in a native OS overlay, the extension uses a local bridge to read them.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '11.5px' }}>
              {/* Step 1 */}
              <div style={{ padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <p style={{ fontWeight: 600, color: '#a5b4fc', marginBottom: '2px' }}>1. Enable Chrome Live Caption</p>
                <p style={{ color: 'var(--text-subtle)', lineHeight: 1.4 }}>
                  In Chrome, go to <b>chrome://settings/accessibility</b> and toggle <b>Live Caption</b> ON.
                </p>
              </div>

              {/* Step 2 */}
              <div style={{ padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <p style={{ fontWeight: 600, color: '#a5b4fc', marginBottom: '2px' }}>2. Start the Companion Bridge</p>
                <p style={{ color: 'var(--text-subtle)', lineHeight: 1.4, marginBottom: '6px' }}>
                  Open your terminal in the project directory and run:
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <code style={{ flex: 1, padding: '4px 6px', background: '#090d16', borderRadius: '4px', fontSize: '11px', color: '#34d399', fontFamily: 'monospace' }}>
                    npm run caption-bridge
                  </code>
                  <button
                    className="btn"
                    onClick={() => {
                      navigator.clipboard.writeText('npm run caption-bridge');
                    }}
                    style={{ padding: '3px 6px', fontSize: '10px' }}
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Step 3 */}
              <div style={{ padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <p style={{ fontWeight: 600, color: '#a5b4fc', marginBottom: '2px' }}>3. Play any Video</p>
                <p style={{ color: 'var(--text-subtle)', lineHeight: 1.4 }}>
                  Play any lecture on YouTube, Coursera, Udemy, Twitter, or local file. The bridge will capture words live into this panel!
                </p>
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => setShowSetupModal(false)}
              style={{ alignSelf: 'flex-end', marginTop: '6px' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
