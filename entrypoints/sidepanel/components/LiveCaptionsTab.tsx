import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Radio,
  Play,
  Pause,
  Trash2,
  FilePlus,
  Copy,
  Sparkles,
  HelpCircle,
  Check,
  Search,
} from 'lucide-react';
import type { ExtensionMessage, LiveCaptionItem, VideoStateResponse } from '../../../utils/messaging';
import { formatSeconds, extractDeltaText } from '../../../utils/transcriptExtractor';

interface LiveCaptionsTabProps {
  onInsertIntoNotes: (text: string) => void;
  onSeek: (timestamp: number) => void;
  pageUrl: string;
  onSummarizeWithAI: (transcript: string) => void;
  onOpenSettings: () => void;
  onRegisterFlush?: (flushFn: () => void) => void;
}

type CaptionSource = LiveCaptionItem['source'];

interface SourceStreamState {
  accumulated: string;
  lastRaw: string;
  lastCommitted: string;
  safetyCommittedPrefix: string;
  pendingChunk: string;
  pendingTimestamp: number | null;
  pendingFormattedTime: string | null;
  timer: ReturnType<typeof setTimeout> | null;
}

function createEmptySourceState(): SourceStreamState {
  return {
    accumulated: '',
    lastRaw: '',
    lastCommitted: '',
    safetyCommittedPrefix: '',
    pendingChunk: '',
    pendingTimestamp: null,
    pendingFormattedTime: null,
    timer: null,
  };
}

export function normalizeCaptionUrl(url: string): string {
  return (url || '').split('#')[0].replace(/[?&]t=\d+s?/, '');
}

function normalizeCaptionWord(word: string): string {
  const stripped = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  return stripped || word.toLowerCase();
}

/**
 * Merges a newly arriving in-page caption delta with an uncommitted pending buffer.
 * Distinguishes extensions, minor in-place ASR word revisions, and rolling scroll-offs
 * from brand-new non-overlapping cues (returning the prior cue to flush first).
 */
export function mergeRollingPendingText(
  pending: string,
  incomingDelta: string
): { merged: string; flushedPrefix: string; isContinuation: boolean } {
  const cleanPending = pending.replace(/\s+/g, ' ').trim();
  const cleanIncoming = incomingDelta.replace(/\s+/g, ' ').trim();

  if (!cleanPending) {
    return { merged: cleanIncoming, flushedPrefix: '', isContinuation: true };
  }
  if (!cleanIncoming) {
    return { merged: cleanPending, flushedPrefix: '', isContinuation: true };
  }

  const pWords = cleanPending.split(/\s+/);
  const iWords = cleanIncoming.split(/\s+/);
  const pNorm = pWords.map(normalizeCaptionWord);
  const iNorm = iWords.map(normalizeCaptionWord);

  // 1. Exact normalized prefix extension (incoming extends or punctuates pending)
  if (iNorm.length >= pNorm.length && pNorm.every((w, idx) => w === iNorm[idx])) {
    return { merged: cleanIncoming, flushedPrefix: '', isContinuation: true };
  }

  // 2. In-place ASR revision / word completion on the same phrase
  let commonPrefix = 0;
  const minLen = Math.min(pNorm.length, iNorm.length);
  while (commonPrefix < minLen && pNorm[commonPrefix] === iNorm[commonPrefix]) {
    commonPrefix++;
  }

  const lastWordStemMatch =
    pNorm.length >= 2 &&
    commonPrefix === pNorm.length - 1 &&
    iNorm.length >= pNorm.length &&
    (iNorm[pNorm.length - 1].startsWith(pNorm[pNorm.length - 1]) ||
      pNorm[pNorm.length - 1].startsWith(iNorm[pNorm.length - 1]));

  if ((pNorm.length >= 3 && commonPrefix >= pNorm.length - 1) || lastWordStemMatch) {
    return { merged: cleanIncoming, flushedPrefix: '', isContinuation: true };
  }

  // 3. Rolling window scroll-off: suffix of pending (>= 2 words) matches prefix of incoming
  const maxOverlap = Math.min(pNorm.length, iNorm.length);
  for (let len = maxOverlap; len >= 2; len--) {
    let matches = true;
    for (let k = 0; k < len; k++) {
      if (pNorm[pNorm.length - len + k] !== iNorm[k]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      const keptPrefixWords = pWords.slice(0, pWords.length - len);
      const keptPrefix = keptPrefixWords.join(' ');
      // If >= 20 scrolled-off words accumulated with no punctuation, flush the stable prefix
      if (keptPrefixWords.length >= 20) {
        return { merged: cleanIncoming, flushedPrefix: keptPrefix, isContinuation: true };
      }
      const merged = keptPrefix ? `${keptPrefix} ${cleanIncoming}` : cleanIncoming;
      return { merged, flushedPrefix: '', isContinuation: true };
    }
  }

  // 4. Distinct non-overlapping cue: flush prior pending cue before buffering new one
  return { merged: cleanIncoming, flushedPrefix: cleanPending, isContinuation: false };
}

/**
 * Strips any prefix already flushed early by the local safety timer or manual flush
 * so a subsequent bridge `isFinal` or extended interim delta does not duplicate words.
 */
export function reconcileBridgeDeltaWithSafetyCommit(
  incomingDelta: string,
  safetyPrefix: string
): string {
  const cleanInc = incomingDelta.replace(/\s+/g, ' ').trim();
  const cleanSafe = safetyPrefix.replace(/\s+/g, ' ').trim();

  if (!cleanSafe) return cleanInc;
  if (!cleanInc) return '';

  const extracted = extractDeltaText(cleanSafe, cleanInc);
  if (extracted !== cleanInc) {
    return extracted;
  }

  // Handle minor ASR tail-word revision between early safety flush ("we are train")
  // and later bridge segment ("we are training neural networks.")
  const sWords = cleanSafe.split(/\s+/);
  const iWords = cleanInc.split(/\s+/);
  const sNorm = sWords.map(normalizeCaptionWord).filter(Boolean);
  const iNorm = iWords.map(normalizeCaptionWord).filter(Boolean);

  if (sNorm.length === 0 || iNorm.length === 0) return cleanInc;

  let commonPrefix = 0;
  const minLen = Math.min(sNorm.length, iNorm.length);
  while (commonPrefix < minLen && sNorm[commonPrefix] === iNorm[commonPrefix]) {
    commonPrefix++;
  }

  const tailStemMatch =
    sNorm.length >= 2 &&
    commonPrefix === sNorm.length - 1 &&
    iNorm.length >= sNorm.length &&
    (iNorm[sNorm.length - 1].startsWith(sNorm[sNorm.length - 1]) ||
      sNorm[sNorm.length - 1].startsWith(iNorm[sNorm.length - 1]));

  if (tailStemMatch) {
    return iWords
      .slice(commonPrefix)
      .join(' ')
      .replace(/^[\s,;.?!:—-]+/, '')
      .trim();
  }

  if (sNorm.length >= 3 && commonPrefix >= 2 && commonPrefix >= sNorm.length - 1) {
    return iWords
      .slice(commonPrefix)
      .join(' ')
      .replace(/^[\s,;.?!:—-]+/, '')
      .trim();
  }

  return cleanInc;
}

export const LiveCaptionsTab: React.FC<LiveCaptionsTabProps> = ({
  onInsertIntoNotes,
  onSeek,
  pageUrl,
  onSummarizeWithAI,
  onOpenSettings,
  onRegisterFlush,
}) => {
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [bridgeSource, setBridgeSource] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(true);
  const [isDictating, setIsDictating] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [autoAppend, setAutoAppend] = useState(true);
  const [activeBySource, setActiveBySource] = useState<Partial<Record<CaptionSource, string>>>({});
  const [captionItems, setCaptionItems] = useState<LiveCaptionItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const streamStatesRef = useRef<Map<CaptionSource, SourceStreamState>>(new Map());
  const sessionGenerationRef = useRef<number>(0);
  const commitQueueRef = useRef<Promise<void>>(Promise.resolve());
  const currentWindowIdRef = useRef<number | undefined>(undefined);
  const normalizedPageUrlRef = useRef<string>(normalizeCaptionUrl(pageUrl));

  const lastKnownVideoTimeRef = useRef<{ timestamp: number; formattedTime: string }>({
    timestamp: 0,
    formattedTime: '00:00',
  });
  const speechRecognitionRef = useRef<any>(null);
  const isDictatingRef = useRef(false);
  const isMountedRef = useRef(true);
  const initialBridgeSettledRef = useRef(false);
  const resolveInitialBridgeCheckRef = useRef<(() => void) | null>(null);
  const initialBridgeReadyPromiseRef = useRef<Promise<void> | null>(null);
  if (!initialBridgeSettledRef.current && !initialBridgeReadyPromiseRef.current) {
    initialBridgeReadyPromiseRef.current = new Promise<void>((resolve) => {
      resolveInitialBridgeCheckRef.current = () => {
        initialBridgeSettledRef.current = true;
        resolve();
        resolveInitialBridgeCheckRef.current = null;
        initialBridgeReadyPromiseRef.current = null;
      };
    });
  }
  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;
  const bridgeConnectedRef = useRef(bridgeConnected);
  bridgeConnectedRef.current = bridgeConnected;
  const bridgeSourceRef = useRef(bridgeSource);
  bridgeSourceRef.current = bridgeSource;

  const autoAppendRef = useRef(autoAppend);
  autoAppendRef.current = autoAppend;
  const pageUrlRef = useRef(pageUrl);
  pageUrlRef.current = pageUrl;
  const onInsertIntoNotesRef = useRef(onInsertIntoNotes);
  onInsertIntoNotesRef.current = onInsertIntoNotes;

  const activeLiveText = (['speech-recognition', 'chrome-live-caption', 'web-caption'] as const)
    .map((src) => activeBySource[src]?.trim())
    .filter(Boolean)
    .join(' · ');

  function getSourceState(source: CaptionSource): SourceStreamState {
    let state = streamStatesRef.current.get(source);
    if (!state) {
      state = createEmptySourceState();
      streamStatesRef.current.set(source, state);
    }
    return state;
  }

  function setActiveTextForSource(source: CaptionSource, text: string) {
    setActiveBySource((prev) => {
      const trimmed = text.trim();
      if (!trimmed && !prev[source]) return prev;
      if (prev[source] === trimmed) return prev;
      const next = { ...prev };
      if (trimmed) {
        next[source] = trimmed;
      } else {
        delete next[source];
      }
      return next;
    });
  }

  function clearAllSourceTimers() {
    for (const state of streamStatesRef.current.values()) {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
    }
  }

  // Load persisted auto-append preference and detect side panel window ID
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['caption_auto_append'], (res) => {
        if (res && res.caption_auto_append !== undefined) {
          setAutoAppend(Boolean(res.caption_auto_append));
        }
      });
    }
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(([tab]) => {
          if (tab?.windowId !== undefined) {
            currentWindowIdRef.current = tab.windowId;
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleToggleAutoAppend = (val: boolean) => {
    setAutoAppend(val);
    autoAppendRef.current = val;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ caption_auto_append: val });
    }
  };

  async function sendTabCaptionCommand(type: 'START_LIVE_CAPTIONS' | 'STOP_LIVE_CAPTIONS') {
    try {
      if (
        type === 'START_LIVE_CAPTIONS' &&
        !initialBridgeSettledRef.current &&
        initialBridgeReadyPromiseRef.current
      ) {
        await initialBridgeReadyPromiseRef.current;
        if (!isMountedRef.current || !isRecordingRef.current) return;
      }
      if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        if (type === 'START_LIVE_CAPTIONS') {
          if (!isMountedRef.current || !isRecordingRef.current) return;
          await chrome.tabs.sendMessage<ExtensionMessage>(tab.id, {
            type: 'START_LIVE_CAPTIONS',
            autoEnableCC: !bridgeConnectedRef.current,
          });
        } else {
          await chrome.tabs.sendMessage<ExtensionMessage>(tab.id, {
            type: 'STOP_LIVE_CAPTIONS',
          });
        }
      }
    } catch {
      // Tab not ready
    }
  }

  // Fetch current video timestamp from content script
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

  function appendCommittedItem(
    delta: string,
    source: CaptionSource,
    resolvedTime: { timestamp: number; formattedTime: string },
    targetPageUrl: string
  ) {
    const newItem: LiveCaptionItem = {
      id: crypto.randomUUID(),
      text: delta,
      timestamp: resolvedTime.timestamp,
      formattedTime: resolvedTime.formattedTime,
      isFinal: true,
      source,
    };

    setCaptionItems((prev) => [...prev, newItem]);

    if (autoAppendRef.current) {
      const link = targetPageUrl
        ? `${targetPageUrl}#t=${Math.floor(resolvedTime.timestamp)}s`
        : `#t=${Math.floor(resolvedTime.timestamp)}s`;
      const line = `\n- [${resolvedTime.formattedTime}](${link}) ${delta}`;
      onInsertIntoNotesRef.current(line);
    }
  }

  // Commit helper: synchronous when explicitTime is already known; serialized when async lookup is required
  function commitCaptionChunk(
    chunkText: string,
    source: CaptionSource,
    explicitTime?: { timestamp: number; formattedTime: string },
    options?: { allowRepeatedPhrase?: boolean }
  ) {
    const state = getSourceState(source);
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    const delta = chunkText.trim();
    if (!delta || /^[\s.,;:!?—-]+$/.test(delta)) return;
    if (!options?.allowRepeatedPhrase && delta === state.lastCommitted && !state.pendingChunk) return;

    state.accumulated += (state.accumulated ? ' ' : '') + delta;
    state.lastCommitted = delta;
    state.pendingChunk = '';
    state.pendingTimestamp = null;
    state.pendingFormattedTime = null;
    setActiveTextForSource(source, '');

    const generation = sessionGenerationRef.current;
    const capturedPageUrl = pageUrlRef.current;

    if (explicitTime) {
      appendCommittedItem(delta, source, explicitTime, capturedPageUrl);
      return;
    }

    commitQueueRef.current = commitQueueRef.current.then(async () => {
      if (generation !== sessionGenerationRef.current) return;
      const resolvedTime = await getCurrentVideoTime();
      if (generation !== sessionGenerationRef.current) return;
      if (normalizeCaptionUrl(capturedPageUrl) !== normalizeCaptionUrl(pageUrlRef.current)) return;

      appendCommittedItem(delta, source, resolvedTime, capturedPageUrl);
    });
  }

  // Synchronously flush buffered chunks (e.g. on pause or right before App switches away from current video)
  function flushPendingCaptions() {
    for (const source of ['chrome-live-caption', 'windows-live-caption', 'web-caption'] as const) {
      const state = streamStatesRef.current.get(source);
      if (!state) continue;
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      const pending = state.pendingChunk.trim();
      if (pending) {
        if (source === 'chrome-live-caption') {
          state.safetyCommittedPrefix = state.safetyCommittedPrefix
            ? `${state.safetyCommittedPrefix} ${pending}`
            : pending;
        }
        const ts =
          state.pendingTimestamp !== null && state.pendingFormattedTime
            ? { timestamp: state.pendingTimestamp, formattedTime: state.pendingFormattedTime }
            : { ...lastKnownVideoTimeRef.current };
        commitCaptionChunk(pending, source, ts, { allowRepeatedPhrase: true });
      }
    }
  }

  useEffect(() => {
    onRegisterFlush?.(() => {
      if (isRecordingRef.current) {
        flushPendingCaptions();
      }
    });
    return () => onRegisterFlush?.(() => {});
  }, [onRegisterFlush]);

  function resetCaptionSession() {
    sessionGenerationRef.current += 1;
    clearAllSourceTimers();
    streamStatesRef.current.clear();
    lastKnownVideoTimeRef.current = { timestamp: 0, formattedTime: '00:00' };
    setCaptionItems([]);
    setActiveBySource({});
  }

  // Reset per-source buffers and feed when navigating to a different video URL
  useEffect(() => {
    const nextNorm = normalizeCaptionUrl(pageUrl);
    const prevNorm = normalizedPageUrlRef.current;
    if (!prevNorm) {
      normalizedPageUrlRef.current = nextNorm;
      if (nextNorm && isRecordingRef.current) {
        sendTabCaptionCommand('START_LIVE_CAPTIONS');
      }
      return;
    }
    if (nextNorm && nextNorm !== prevNorm) {
      normalizedPageUrlRef.current = nextNorm;
      resetCaptionSession();
      if (isRecordingRef.current) {
        sendTabCaptionCommand('START_LIVE_CAPTIONS');
      }
    }
  }, [pageUrl]);

  // Process incoming WebSocket CAPTION_UPDATE from local bridge
  function processBridgeCaption(rawText: string, bridgeDelta: string | undefined, isFinalHint: boolean) {
    const clean = rawText.replace(/\s+/g, ' ').trim();
    if (!clean) return;

    const state = getSourceState('chrome-live-caption');
    const hasExplicitDelta = typeof bridgeDelta === 'string';
    const rawDelta = hasExplicitDelta ? bridgeDelta.trim() : extractDeltaText(state.accumulated, clean);

    const resolveBridgeDelta = (candidate: string, safetyPrefix: string): string => {
      if (!candidate) return '';
      if (!hasExplicitDelta) return candidate;
      const afterSafety = safetyPrefix
        ? reconcileBridgeDeltaWithSafetyCommit(candidate, safetyPrefix)
        : candidate;
      if (!afterSafety || !state.accumulated) return afterSafety;
      // Guard against long multi-word carry-over even when bridge reconnects mid-session
      return afterSafety.split(/\s+/).length >= 8
        ? extractDeltaText(state.accumulated, afterSafety)
        : afterSafety;
    };

    if (isFinalHint) {
      const safetyPrefix = state.safetyCommittedPrefix;
      state.safetyCommittedPrefix = '';
      if (!rawDelta) return;

      const delta = resolveBridgeDelta(rawDelta, safetyPrefix);

      if (!delta) {
        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = null;
        }
        state.pendingChunk = '';
        state.pendingTimestamp = null;
        state.pendingFormattedTime = null;
        setActiveTextForSource('chrome-live-caption', '');
        return;
      }

      // Avoid double-committing if safety fallback already flushed this exact chunk
      if (!state.pendingChunk && delta === state.lastCommitted && safetyPrefix) {
        return;
      }
      commitCaptionChunk(delta, 'chrome-live-caption', undefined, { allowRepeatedPhrase: true });
      return;
    }

    if (!rawDelta) return;
    const delta = resolveBridgeDelta(rawDelta, state.safetyCommittedPrefix);
    if (!delta) return;

    // Interim ASR hypothesis: update pending buffer cleanly without locking into accumulated
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    if (!hasExplicitDelta && state.pendingChunk) {
      const mergedRes = mergeRollingPendingText(state.pendingChunk, delta);
      if (!mergedRes.isContinuation && mergedRes.flushedPrefix) {
        const ts =
          state.pendingTimestamp !== null && state.pendingFormattedTime
            ? { timestamp: state.pendingTimestamp, formattedTime: state.pendingFormattedTime }
            : { ...lastKnownVideoTimeRef.current };
        commitCaptionChunk(mergedRes.flushedPrefix, 'chrome-live-caption', ts, {
          allowRepeatedPhrase: true,
        });
      }
      state.pendingChunk = mergedRes.merged;
    } else {
      state.pendingChunk = delta;
    }

    if (state.pendingTimestamp === null) {
      state.pendingTimestamp = lastKnownVideoTimeRef.current.timestamp;
      state.pendingFormattedTime = lastKnownVideoTimeRef.current.formattedTime;
    }

    setActiveTextForSource('chrome-live-caption', state.pendingChunk);

    // Fallback safety timer slightly longer than bridge's 4.0s pause threshold
    const generation = sessionGenerationRef.current;
    state.timer = setTimeout(() => {
      if (generation !== sessionGenerationRef.current) return;
      const pending = state.pendingChunk.trim();
      if (pending) {
        state.safetyCommittedPrefix = state.safetyCommittedPrefix
          ? `${state.safetyCommittedPrefix} ${pending}`
          : pending;
        commitCaptionChunk(pending, 'chrome-live-caption', undefined, {
          allowRepeatedPhrase: true,
        });
      }
    }, 5500);
  }

  // Process incoming in-page caption/subtitle from content script preserving cue timestamps
  function processWebCaption(rawText: string, timestamp: number, formattedTime: string) {
    const clean = rawText.replace(/\s+/g, ' ').trim();
    if (!clean) return;

    lastKnownVideoTimeRef.current = { timestamp, formattedTime };

    const state = getSourceState('web-caption');
    if (clean === state.lastRaw) return;
    state.lastRaw = clean;

    const delta = extractDeltaText(state.accumulated, clean);
    if (!delta) return;

    const mergedRes = mergeRollingPendingText(state.pendingChunk, delta);

    // If a distinct non-overlapping cue arrived OR >= 20 scrolled-off words accumulated, commit prior first
    if (mergedRes.flushedPrefix) {
      const flushTs =
        state.pendingTimestamp !== null && state.pendingFormattedTime
          ? { timestamp: state.pendingTimestamp, formattedTime: state.pendingFormattedTime }
          : { timestamp, formattedTime };
      commitCaptionChunk(mergedRes.flushedPrefix, 'web-caption', flushTs, {
        allowRepeatedPhrase: true,
      });
    }

    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    const nextPending = mergedRes.merged;
    const nextTs =
      mergedRes.isContinuation && !mergedRes.flushedPrefix && state.pendingTimestamp !== null
        ? {
            timestamp: state.pendingTimestamp,
            formattedTime: state.pendingFormattedTime || formattedTime,
          }
        : { timestamp, formattedTime };

    state.pendingChunk = nextPending;
    state.pendingTimestamp = nextTs.timestamp;
    state.pendingFormattedTime = nextTs.formattedTime;
    setActiveTextForSource('web-caption', nextPending);

    // Commit immediately ONLY on true sentence-ending punctuation (never on 8 words or ;/:)
    if (/[.?!]["')\]]*$/.test(nextPending)) {
      commitCaptionChunk(nextPending, 'web-caption', nextTs, { allowRepeatedPhrase: true });
      return;
    }

    // Natural pause timeout: flush buffered phrase after 2.0s of silence using its captured cue time
    const generation = sessionGenerationRef.current;
    state.timer = setTimeout(() => {
      if (generation !== sessionGenerationRef.current) return;
      if (state.pendingChunk) {
        const ts =
          state.pendingTimestamp !== null && state.pendingFormattedTime
            ? { timestamp: state.pendingTimestamp, formattedTime: state.pendingFormattedTime }
            : { timestamp, formattedTime };
        commitCaptionChunk(state.pendingChunk, 'web-caption', ts, { allowRepeatedPhrase: true });
      }
    }, 2000);
  }

  // Persistent listener for local companion bridge (ws://127.0.0.1:8765)
  useEffect(() => {
    let isMounted = true;
    isMountedRef.current = true;
    const initialBridgeTimer = setTimeout(() => {
      resolveInitialBridgeCheckRef.current?.();
    }, 300);

    function connectBridge() {
      if (!isMounted) return;
      try {
        const ws = new WebSocket('ws://127.0.0.1:8765');
        socketRef.current = ws;

        ws.onopen = () => {
          clearTimeout(initialBridgeTimer);
          if (!isMounted) {
            resolveInitialBridgeCheckRef.current?.();
            return;
          }
          bridgeConnectedRef.current = true;
          setBridgeConnected(true);
          resolveInitialBridgeCheckRef.current?.();
        };

        ws.onmessage = (evt) => {
          if (!isMounted || !isRecordingRef.current) return;
          try {
            const data = JSON.parse(evt.data);

            if (data.type === 'SOURCE_ATTACHED') {
              bridgeSourceRef.current = data.source;
              setBridgeSource(data.source);
            } else if (data.type === 'SOURCE_DETACHED') {
              bridgeSourceRef.current = null;
              setBridgeSource(null);
            } else if (data.type === 'CAPTION_UPDATE') {
              const text = (data.text || '').trim();
              const delta = typeof data.delta === 'string' ? data.delta.trim() : undefined;
              if (text || delta) {
                processBridgeCaption(text || delta || '', delta, Boolean(data.isFinal));
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          clearTimeout(initialBridgeTimer);
          resolveInitialBridgeCheckRef.current?.();
          if (!isMounted) return;
          socketRef.current = null;
          bridgeConnectedRef.current = false;
          bridgeSourceRef.current = null;
          setBridgeConnected(false);
          setBridgeSource(null);

          // Fast reconnect poll every 2.5s so bridge connection activates immediately when started
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMounted) connectBridge();
          }, 2500);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        clearTimeout(initialBridgeTimer);
        resolveInitialBridgeCheckRef.current?.();
        // Silently retry
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMounted) connectBridge();
        }, 2500);
      }
    }

    connectBridge();

    return () => {
      isMounted = false;
      isMountedRef.current = false;
      clearTimeout(initialBridgeTimer);
      resolveInitialBridgeCheckRef.current?.();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      clearAllSourceTimers();
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  // Primary In-Browser closed caption / subtitle observer
  useEffect(() => {
    let isMounted = true;

    if (isRecordingRef.current) {
      sendTabCaptionCommand('START_LIVE_CAPTIONS');
    }

    const webCaptionListener = (msg: ExtensionMessage, sender?: chrome.runtime.MessageSender) => {
      if (!isMounted || !isRecordingRef.current) return;
      if (msg.type !== 'LIVE_WEB_CAPTION' || !msg.text) return;
      if (sender?.tab) {
        if (!sender.tab.active) return;
        if (currentWindowIdRef.current !== undefined && sender.tab.windowId !== currentWindowIdRef.current) {
          return;
        }
      }
      // Avoid dual-source collision when Chrome Live Caption Bridge is actively streaming
      if (bridgeConnectedRef.current && bridgeSourceRef.current) return;

      processWebCaption(msg.text, msg.timestamp, msg.formattedTime);
    };

    const tabCompleteListener = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (!isMounted || !isRecordingRef.current) return;
      if (changeInfo.status !== 'complete' || !tab.active) return;
      if (currentWindowIdRef.current !== undefined && tab.windowId !== currentWindowIdRef.current) {
        return;
      }
      sendTabCaptionCommand('START_LIVE_CAPTIONS');
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(webCaptionListener);
    }
    if (typeof chrome !== 'undefined' && chrome.tabs?.onUpdated) {
      chrome.tabs.onUpdated.addListener(tabCompleteListener);
    }

    return () => {
      isMounted = false;
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(webCaptionListener);
      }
      if (typeof chrome !== 'undefined' && chrome.tabs?.onUpdated) {
        chrome.tabs.onUpdated.removeListener(tabCompleteListener);
      }
      sendTabCaptionCommand('STOP_LIVE_CAPTIONS');
    };
  }, []);

  // Cleanup active SpeechRecognition on unmount
  useEffect(() => {
    return () => {
      isDictatingRef.current = false;
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
        speechRecognitionRef.current = null;
      }
      clearAllSourceTimers();
    };
  }, []);

  function stopDictationCleanly(errorMsg?: string) {
    isDictatingRef.current = false;
    setIsDictating(false);
    if (errorMsg) {
      setDictationError(errorMsg);
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }
    setActiveTextForSource('speech-recognition', '');
  }

  function handleToggleRecording() {
    if (isRecordingRef.current) {
      flushPendingCaptions();
      isRecordingRef.current = false;
      setIsRecording(false);
      sendTabCaptionCommand('STOP_LIVE_CAPTIONS');
    } else {
      isRecordingRef.current = true;
      setIsRecording(true);
      sendTabCaptionCommand('START_LIVE_CAPTIONS');
    }
  }

  // In-Browser Web Speech Dictation Manager
  function handleToggleDictation() {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition ||
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setDictationError('Browser speech recognition is not supported in this Chromium version.');
      return;
    }

    if (isDictating) {
      stopDictationCleanly();
      return;
    }

    setDictationError(null);

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onresult = (event: any) => {
        let interim = '';
        let finalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptPart = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            finalChunk +=
              (finalChunk && !finalChunk.endsWith(' ') && !transcriptPart.startsWith(' ') ? ' ' : '') +
              transcriptPart;
          } else {
            interim += transcriptPart;
          }
        }

        setActiveTextForSource('speech-recognition', interim.trim());

        if (finalChunk.trim()) {
          commitCaptionChunk(finalChunk.trim(), 'speech-recognition', undefined, {
            allowRepeatedPhrase: true,
          });
        }
      };

      recognition.onerror = (err: any) => {
        const code = err?.error;
        console.warn('Speech recognition error:', code || err);
        if (code === 'no-speech') {
          return; // Non-fatal silence timeout in continuous mode
        }
        const message =
          code === 'not-allowed' || code === 'service-not-allowed'
            ? 'Microphone permission denied for extension side panel.'
            : code === 'audio-capture'
            ? 'No microphone audio input detected.'
            : `Dictation stopped (${code || 'error'}).`;
        stopDictationCleanly(message);
      };

      recognition.onend = () => {
        if (isDictatingRef.current) {
          try {
            recognition.start();
          } catch {
            stopDictationCleanly('Could not restart speech recognition.');
          }
        } else {
          setIsDictating(false);
          setActiveTextForSource('speech-recognition', '');
        }
      };

      isDictatingRef.current = true;
      recognition.start();
      speechRecognitionRef.current = recognition;
      setIsDictating(true);
    } catch (err) {
      console.warn('Could not start speech recognition:', err);
      stopDictationCleanly('Could not start speech recognition.');
    }
  }

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
    resetCaptionSession();
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
            {bridgeConnected ? (
              <span className="badge badge-connected" title={`Connected to ${bridgeSource || 'Chrome Live Caption'}`}>
                <span className="pulse-indicator" style={{ background: '#34d399' }} />
                <span>{bridgeSource || 'Chrome Live Caption'}</span>
              </span>
            ) : isDictating ? (
              <span
                className="badge"
                style={{
                  background: 'rgba(236, 72, 153, 0.15)',
                  color: '#f472b6',
                  borderColor: 'rgba(236, 72, 153, 0.3)',
                }}
                title="Live speech dictation active"
              >
                <span className="pulse-indicator" style={{ background: '#f472b6' }} />
                <span>Dictation Active</span>
              </span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span
                  className="badge"
                  style={{
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#a5b4fc',
                    borderColor: 'rgba(99, 102, 241, 0.3)',
                  }}
                  title="Capturing in-page video subtitles and closed captions"
                >
                  <Radio size={11} />
                  <span>In-Page Subtitles</span>
                </span>
                <button
                  className="btn"
                  onClick={() => setShowSetupModal(true)}
                  style={{
                    fontSize: '10.5px',
                    padding: '2px 6px',
                    height: '21px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    color: '#fbbf24',
                    borderColor: 'rgba(245, 158, 11, 0.3)',
                  }}
                  title="Chrome Live Caption Bridge not connected. Click for setup guide."
                >
                  <span>Bridge: Offline</span>
                </button>
              </div>
            )}
          </div>

          <button
            className="btn btn-icon"
            onClick={() => setShowSetupModal(true)}
            title="Captions & Dictation Guide"
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
              onClick={handleToggleRecording}
              title={isRecording ? 'Pause Captions Stream' : 'Resume Captions Stream'}
              style={{ fontSize: '11px', padding: '4px 8px' }}
            >
              {isRecording ? <Pause size={12} /> : <Play size={12} />}
              <span>{isRecording ? 'Capturing' : 'Paused'}</span>
            </button>

            <button
              className={`btn ${isDictating ? 'btn-primary' : ''}`}
              onClick={handleToggleDictation}
              title={isDictating ? 'Stop Voice Dictation' : 'Start Live Voice Dictation'}
              style={{
                fontSize: '11px',
                padding: '4px 8px',
                borderColor: isDictating ? '#f472b6' : undefined,
                background: isDictating ? 'rgba(236, 72, 153, 0.25)' : undefined,
                color: isDictating ? '#f472b6' : undefined,
              }}
            >
              {isDictating ? <MicOff size={12} /> : <Mic size={12} />}
              <span>{isDictating ? 'Dictating' : 'Dictate'}</span>
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
              <span>AI</span>
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
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              color: autoAppend ? 'var(--accent-emerald)' : 'var(--text-muted)',
              fontWeight: autoAppend ? 600 : 400,
            }}
            title="Automatically write every spoken sentence directly into your active Markdown note"
          >
            <input
              type="checkbox"
              checked={autoAppend}
              onChange={(e) => handleToggleAutoAppend(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: 'var(--accent-emerald)' }}
            />
            <span>Auto-write to Notes</span>
            {autoAppend && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-emerald)', display: 'inline-block' }} />}
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

        {dictationError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '5px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(244, 63, 94, 0.14)',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              color: '#fda4af',
              fontSize: '11px',
            }}
          >
            <span>{dictationError}</span>
            <button
              className="btn btn-icon"
              onClick={() => setDictationError(null)}
              style={{ padding: '1px 4px', fontSize: '10px', color: '#fda4af' }}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
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
              <Radio size={20} color="var(--accent-primary)" />
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>Listening for Captions & Speech</p>
              <p style={{ fontSize: '11.5px', marginTop: '4px', color: 'var(--text-subtle)', lineHeight: 1.4 }}>
                Play any video with closed captions or subtitles enabled, or start the <b>Chrome Live Caption Bridge</b> to capture Chrome&apos;s native speech bubbles. Captions will automatically appear here and write into your notes.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setShowSetupModal(true)}
              style={{ fontSize: '11px', marginTop: '6px' }}
            >
              Setup Chrome Live Caption
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
            {item.source === 'chrome-live-caption' && (
              <span style={{ fontSize: '10px', color: '#34d399', opacity: 0.8 }} title="Source: Chrome Live Caption">🖥️</span>
            )}
            {item.source === 'speech-recognition' && (
              <span style={{ fontSize: '10px', color: '#f472b6', opacity: 0.8 }} title="Source: Voice Dictation">🎙️</span>
            )}
            {item.source === 'web-caption' && (
              <span style={{ fontSize: '10px', color: '#38bdf8', opacity: 0.8 }} title="Source: In-Page Subtitles">📺</span>
            )}
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

      {/* Captions & Dictation Guide Modal */}
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
              maxWidth: '400px',
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
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>Chrome Live Caption & Transcription</h3>
              <button className="btn btn-icon" onClick={() => setShowSetupModal(false)}>
                ✕
              </button>
            </div>

            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              <b>Why is a bridge needed for Chrome Live Caption?</b> Chrome&apos;s floating Live Caption window is an operating-system desktop window outside the web page. Browser extensions cannot read desktop windows without a lightweight local companion script.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '11.5px' }}>
              {/* Option 1: Chrome Live Caption Bridge */}
              <div style={{ padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <p style={{ fontWeight: 600, color: '#34d399', marginBottom: '2px' }}>1. Start Chrome Live Caption Bridge</p>
                <p style={{ color: 'var(--text-subtle)', lineHeight: 1.4, marginBottom: '6px' }}>
                  Enable Live Caption in <code>chrome://settings/accessibility</code>, then in your project directory run:
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <code style={{ flex: 1, padding: '4px 6px', background: '#090d16', borderRadius: '4px', fontSize: '10.5px', color: '#34d399', fontFamily: 'monospace' }}>
                    npm run caption-bridge
                  </code>
                  <button
                    className="btn"
                    onClick={() => navigator.clipboard.writeText('npm run caption-bridge')}
                    style={{ padding: '3px 8px', fontSize: '10px' }}
                  >
                    Copy
                  </button>
                </div>
                <p style={{ color: 'var(--text-subtle)', fontSize: '10.5px', marginTop: '4px' }}>
                  Or double-click <code>companion/run_bridge.bat</code> in File Explorer.
                </p>
              </div>

              {/* Option 2: In-Page Subtitles */}
              <div style={{ padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <p style={{ fontWeight: 600, color: '#a5b4fc', marginBottom: '2px' }}>2. In-Page Subtitles (Zero Setup)</p>
                <p style={{ color: 'var(--text-subtle)', lineHeight: 1.4 }}>
                  If the video has closed captions (YouTube CC, Canvas LMS, Coursera, Udemy), the extension captures and streams them automatically with no bridge needed!
                </p>
              </div>

              {/* Option 3: Voice Dictation */}
              <div style={{ padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <p style={{ fontWeight: 600, color: '#f472b6', marginBottom: '2px' }}>3. Live Voice Dictation</p>
                <p style={{ color: 'var(--text-subtle)', lineHeight: 1.4 }}>
                  Click the <b>Dictate</b> button (`🎙️`) to transcribe audio or speak your thoughts directly using Chrome&apos;s built-in speech recognition.
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
