import React, { useEffect, useState, useMemo, useRef } from 'react';
import type {
  ExtensionMessage,
  FrameCaptureResponse,
  TranscriptResponse,
  VideoStateResponse,
} from '../../utils/messaging';
import {
  getSavedVaultDirectory,
  getSavedVaultName,
  saveBinaryAttachment,
  saveMarkdownFile,
  saveMarkdownFileNonDestructive,
  readMarkdownFile,
  readMarkdownFileWithMeta,
  readBinaryAttachment,
  findExistingNote,
  selectVaultDirectory,
  reauthorizeVault,
  generateObsidianFrontmatter,
  checkVaultPermissionStatus,
  openNoteInObsidian,
  downloadMarkdownFile,
} from '../../utils/vaultStorage';
import {
  parseTimestampsFromMarkdown,
  parseFramesFromMarkdown,
  getLastRecordedTimestamp,
  extractFrontmatter,
  type ParsedTimestamp,
} from '../../utils/noteMerge';
import {
  getGeminiApiKey,
  saveGeminiApiKey,
  getGeminiModel,
  saveGeminiModel,
  DEFAULT_GEMINI_MODEL,
  summarizeTranscriptToMarkdown,
  analyzeVideoFrameWithGemini,
} from '../../utils/geminiClient';
import { generateTemplate, type TemplateType } from '../../utils/templates';
import { formatSeconds } from '../../utils/transcriptExtractor';
import { Toolbar } from './components/Toolbar';
import { Editor } from './components/Editor';
import { FrameGallery, type CapturedFrame } from './components/FrameGallery';
import { AIAssistant } from './components/AIAssistant';
import { SettingsModal } from './components/SettingsModal';
import { LiveCaptionsTab } from './components/LiveCaptionsTab';
import { ReviewNoteModal } from './components/ReviewNoteModal';
import {
  FileText,
  Image,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Info,
  Radio,
  Check,
  RefreshCw,
  Clock,
  BookOpen,
  Play,
} from 'lucide-react';
import './styles/theme.css';

interface SaveSnapshot {
  markdown: string;
  title: string;
  frames: CapturedFrame[];
  pageUrl: string;
  existingFileName: string | null;
  baseContent: string;
  lastSavedMarkdown: string;
  lastSavedTitle: string;
  silent: boolean;
}

function isIgnoredBrowserUrl(url?: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return (
    lower.startsWith('chrome://') ||
    lower.startsWith('edge://') ||
    lower.startsWith('about:') ||
    lower.startsWith('chrome-extension://') ||
    lower.startsWith('devtools://')
  );
}

function isKnownVideoUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.startsWith('file://')) return true;
  if (
    lower.includes('youtube.com/watch') ||
    lower.includes('youtube.com/shorts/') ||
    lower.includes('youtube.com/live/') ||
    lower.includes('youtu.be/') ||
    lower.includes('coursera.org/learn/') ||
    lower.includes('udemy.com/course/') ||
    lower.includes('vimeo.com/') ||
    lower.includes('instructure.com') ||
    lower.includes('panopto.') ||
    lower.includes('kaltura.') ||
    lower.includes('echo360.') ||
    lower.includes('loom.com/') ||
    lower.includes('twitch.tv/')
  ) {
    return true;
  }
  const clean = lower.split('#')[0].split('?')[0];
  return /\.(mp4|webm|mov|m4v|m3u8|mkv)$/.test(clean);
}

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_GEMINI_MODEL);
  const [noteTitle, setNoteTitle] = useState('Video Notes');
  const [markdown, setMarkdown] = useState('');
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [vaultName, setVaultName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'gallery' | 'captions' | 'chat'>('editor');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [analyzingFrameId, setAnalyzingFrameId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('standard');
  const [status, setStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [pageUrl, setPageUrl] = useState('');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [vaultPermissionNeeded, setVaultPermissionNeeded] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [existingVaultMarkdown, setExistingVaultMarkdown] = useState('');
  const [existingVaultFileName, setExistingVaultFileName] = useState<string | null>(null);

  // Live video state and persisted playback progress
  const [liveVideoTime, setLiveVideoTime] = useState<{
    currentTime: number;
    formattedTime: string;
    duration: number;
    paused?: boolean;
  } | null>(null);

  const [savedVideoPosition, setSavedVideoPosition] = useState<{
    currentTime: number;
    formattedTime: string;
    duration?: number;
    updatedAt: number;
  } | null>(null);

  // Synchronized refs to avoid stale closures in debounced/interval timers
  const markdownRef = useRef(markdown);
  markdownRef.current = markdown;
  const noteTitleRef = useRef(noteTitle);
  noteTitleRef.current = noteTitle;
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const pageUrlRef = useRef(pageUrl);
  pageUrlRef.current = pageUrl;
  const existingVaultFileNameRef = useRef<string | null>(existingVaultFileName);
  existingVaultFileNameRef.current = existingVaultFileName;

  const lastSavedMarkdownRef = useRef<string>('');
  const lastSavedTitleRef = useRef<string>('');
  const lastKnownDiskContentRef = useRef<string>('');
  const lastKnownFileModifiedRef = useRef<number>(0);
  const lastSavedDiskByUrlRef = useRef<Map<string, string>>(new Map());
  const savedFrameIdsRef = useRef<Set<string>>(new Set());
  const isSavingRef = useRef<boolean>(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const isCheckingVaultRef = useRef<boolean>(false);
  const isProvisionalTitleRef = useRef<boolean>(true);
  const currentWindowIdRef = useRef<number | undefined>(undefined);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushCaptionsRef = useRef<(() => void) | null>(null);
  const activeLoadSeqRef = useRef<number>(0);
  const tabSwitchSeqRef = useRef<number>(0);

  // Synchronously update markdownRef before queuing React state update so context flushes never read stale text
  function updateMarkdown(updater: React.SetStateAction<string>) {
    const current = markdownRef.current;
    const next = typeof updater === 'function' ? updater(current) : updater;
    markdownRef.current = next;
    setMarkdown(next);
  }

  // Dynamic timestamp extraction across markdown and saved vault file (chronological for timeline)
  const timestamps = useMemo(() => {
    return parseTimestampsFromMarkdown(markdown || existingVaultMarkdown);
  }, [markdown, existingVaultMarkdown]);

  // The most recently written note timestamp in document order
  const lastRecordedNote = useMemo(() => {
    return getLastRecordedTimestamp(markdown || existingVaultMarkdown);
  }, [markdown, existingVaultMarkdown]);

  // Compute accurate resume target:
  // 1. If we have a saved video playback position from when the user stopped watching (> 2s),
  //    and the video is currently at the beginning (< 5s), resume to that exact playback position!
  // 2. Otherwise, resume to the most recent note timestamp recorded in the note.
  const resumeTarget = useMemo(() => {
    if (savedVideoPosition && savedVideoPosition.currentTime > 2) {
      if (!liveVideoTime || liveVideoTime.currentTime < 5) {
        return {
          seconds: savedVideoPosition.currentTime,
          formattedTime: savedVideoPosition.formattedTime,
          isPlayback: true,
        };
      }
    }

    if (lastRecordedNote) {
      return {
        seconds: lastRecordedNote.seconds,
        formattedTime: lastRecordedNote.formattedTime,
        isPlayback: false,
      };
    }

    if (savedVideoPosition && savedVideoPosition.currentTime > 0) {
      return {
        seconds: savedVideoPosition.currentTime,
        formattedTime: savedVideoPosition.formattedTime,
        isPlayback: true,
      };
    }

    return null;
  }, [savedVideoPosition, liveVideoTime, lastRecordedNote]);

  // Map of fileName -> dataUrl for live preview
  const framesMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of frames) {
      map.set(f.fileName, f.dataUrl);
    }
    return map;
  }, [frames]);

  // Check and load existing note from Obsidian vault (primary) or local storage cache (fallback)
  async function checkAndLoadExistingNote(
    titleToUse?: string,
    urlToUse?: string,
    forceReload = false
  ) {
    const loadSeq = ++activeLoadSeqRef.current;
    const targetTitle = titleToUse || noteTitleRef.current;
    const targetUrl = urlToUse || pageUrlRef.current;
    const cleanSessionKey = 'session_' + (targetUrl.split('#')[0] || targetTitle);

    // Load persisted video playback position from chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const cleanUrl = targetUrl.split('#')[0].replace(/[?&]t=\d+s?/, '');
      const posKey = 'video_pos_' + cleanUrl;
      chrome.storage.local.get([posKey]).then((stored) => {
        if (loadSeq !== activeLoadSeqRef.current) return;
        if (stored?.[posKey]) {
          setSavedVideoPosition(stored[posKey]);
        }
      }).catch(() => {});
    }

    let cachedSession: { markdown?: string; title?: string; updatedAt?: number } | null = null;
    if (!forceReload && typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await chrome.storage.local.get([cleanSessionKey]);
        if (loadSeq !== activeLoadSeqRef.current) return;
        if (stored?.[cleanSessionKey]?.markdown) {
          cachedSession = stored[cleanSessionKey];
        }
      } catch {
        // Ignored
      }
    }

    // 1. PRIMARY SOURCE OF TRUTH: Query Obsidian vault directory first
    let dirHandle: FileSystemDirectoryHandle | null = null;
    try {
      dirHandle = await getSavedVaultDirectory();
      if (loadSeq !== activeLoadSeqRef.current) return;
    } catch {
      // Ignored
    }

    if (dirHandle) {
      isCheckingVaultRef.current = true;
      try {
        const searchTitle = targetTitle === 'Video Notes' ? '' : targetTitle;
        const match = await findExistingNote(dirHandle, searchTitle, targetUrl);
        if (loadSeq !== activeLoadSeqRef.current) return;

        if (match && match.content) {
          setExistingVaultMarkdown(match.content);
          setExistingVaultFileName(match.fileName);
          existingVaultFileNameRef.current = match.fileName;

          const foundTimestamps = parseTimestampsFromMarkdown(match.content);

          // Adopt title from frontmatter or filename if available and lock against provisional tab updates
          const fm = extractFrontmatter(match.content);
          const resolvedTitle = fm.title || match.fileName.replace(/\.md$/, '') || targetTitle;
          if (resolvedTitle) {
            setNoteTitle(resolvedTitle);
            noteTitleRef.current = resolvedTitle;
            isProvisionalTitleRef.current = false;
          }

          // Reconcile newer local session edits captured before disk write completed
          const hasNewerSessionCache =
            !forceReload &&
            Boolean(cachedSession?.markdown) &&
            cachedSession!.markdown!.trim() !== match.content.trim() &&
            (cachedSession!.updatedAt || 0) > (match.lastModified || 0);

          const nextMarkdown = hasNewerSessionCache ? cachedSession!.markdown! : match.content;

          // Populate editor with Obsidian file content (or newer local cache) and sync tracking refs
          updateMarkdown(nextMarkdown);
          lastSavedMarkdownRef.current = match.content;
          lastSavedTitleRef.current = resolvedTitle;
          lastKnownDiskContentRef.current = match.content;
          lastKnownFileModifiedRef.current = match.lastModified || Date.now();
          lastSavedDiskByUrlRef.current.set(targetUrl.split('#')[0], match.content);
          setHasUnsavedChanges(hasNewerSessionCache);

          // Rehydrate frame attachments from vault attachments directory (always update to clear stale frames)
          const frameNames = parseFramesFromMarkdown(nextMarkdown);
          const restoredFrames: CapturedFrame[] = [];
          if (frameNames.length > 0) {
            for (const fn of frameNames) {
              const existingFrame = framesRef.current.find((f) => f.fileName === fn);
              if (existingFrame) {
                restoredFrames.push(existingFrame);
                savedFrameIdsRef.current.add(existingFrame.id);
              } else {
                const dataUrl = await readBinaryAttachment(dirHandle, fn);
                if (loadSeq !== activeLoadSeqRef.current) return;
                if (dataUrl) {
                  const ts = foundTimestamps.find((t) => t.imageFileName === fn);
                  const newF: CapturedFrame = {
                    id: crypto.randomUUID(),
                    fileName: fn,
                    formattedTime: ts?.formattedTime || '00:00',
                    timestamp: ts?.seconds || 0,
                    dataUrl,
                    pageTitle: resolvedTitle,
                  };
                  restoredFrames.push(newF);
                  savedFrameIdsRef.current.add(newF.id);
                }
              }
            }
          }
          setFrames(restoredFrames);
          framesRef.current = restoredFrames;

          // Keep local storage session cache synchronized when disk won
          if (!hasNewerSessionCache && typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({
              [cleanSessionKey]: {
                markdown: match.content,
                title: resolvedTitle,
                url: targetUrl,
                updatedAt: match.lastModified || Date.now(),
              },
            }).catch(() => {});
          }

          showStatus(
            hasNewerSessionCache
              ? `Restored newer local edits alongside Obsidian note (${foundTimestamps.length} timestamps).`
              : `Loaded note from Obsidian (${foundTimestamps.length} timestamps).`,
            'success',
            3000
          );
          return;
        }
      } catch (err) {
        console.warn('Error checking existing note in vault:', err);
      } finally {
        if (loadSeq === activeLoadSeqRef.current) {
          isCheckingVaultRef.current = false;
        }
      }
    }

    // 2. FALLBACK ONLY: If vault directory is unavailable or note is not in vault yet
    if (loadSeq !== activeLoadSeqRef.current) return;
    if (!forceReload && !markdownRef.current.trim() && cachedSession?.markdown) {
      if (
        cachedSession.title &&
        cachedSession.title !== 'Video Notes' &&
        (isProvisionalTitleRef.current || noteTitleRef.current === 'Video Notes')
      ) {
        setNoteTitle(cachedSession.title);
        noteTitleRef.current = cachedSession.title;
      }
      updateMarkdown(cachedSession.markdown);
      // Session cache has not yet been written to Obsidian vault: keep unsaved so auto-save commits it
      lastSavedMarkdownRef.current = '';
      lastSavedTitleRef.current = '';
      setHasUnsavedChanges(true);
    }
  }

  // Check if the note in Obsidian was modified externally (e.g. user edited in Obsidian)
  async function checkForExternalVaultModifications() {
    if (isSavingRef.current || isCheckingVaultRef.current) return;
    let dirHandle: FileSystemDirectoryHandle | null = null;
    try {
      dirHandle = await getSavedVaultDirectory();
    } catch {
      return;
    }
    if (!dirHandle) return;

    try {
      const targetTitle = noteTitleRef.current;
      const targetUrl = pageUrlRef.current;
      const searchTitle = targetTitle === 'Video Notes' ? '' : targetTitle;
      const match = await findExistingNote(dirHandle, searchTitle, targetUrl);
      if (!match || !match.content) return;
      if (pageUrlRef.current.split('#')[0] !== targetUrl.split('#')[0]) return;

      const diskContent = match.content;
      const lastKnownDisk = lastKnownDiskContentRef.current;

      // Check if file content on disk differs from what was last loaded/saved
      if (lastKnownDisk && diskContent.trim() !== lastKnownDisk.trim()) {
        const userHasEditorEdits = markdownRef.current.trim() !== lastSavedMarkdownRef.current.trim();
        if (!userHasEditorEdits) {
          // User edited in Obsidian, and made NO conflicting edits in the extension editor!
          // Seamlessly update editor with the new Obsidian content
          setExistingVaultMarkdown(diskContent);
          setExistingVaultFileName(match.fileName);
          existingVaultFileNameRef.current = match.fileName;
          updateMarkdown(diskContent);
          lastSavedMarkdownRef.current = diskContent;
          lastKnownDiskContentRef.current = diskContent;
          lastKnownFileModifiedRef.current = match.lastModified || Date.now();
          lastSavedDiskByUrlRef.current.set(targetUrl.split('#')[0], diskContent);
          setHasUnsavedChanges(false);

          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            const cleanKey = 'session_' + (targetUrl.split('#')[0] || targetTitle);
            chrome.storage.local.set({
              [cleanKey]: {
                markdown: diskContent,
                title: targetTitle,
                url: targetUrl,
                updatedAt: match.lastModified || Date.now(),
              },
            }).catch(() => {});
          }

          showStatus('Synchronized note with changes made in Obsidian.', 'info', 3000);
        } else {
          // Conflicting edits: user edited both in Obsidian and extension
          showStatus('Obsidian file modified externally. Review before saving.', 'info', 4000);
        }
      }
    } catch {
      // Ignored
    }
  }

  const hotkeyHandlersRef = useRef<{
    handleCaptureFrame: () => Promise<void>;
    handleInsertTimestamp: () => Promise<void>;
    handleTogglePlay: () => Promise<void>;
  } | null>(null);

  function captureSaveSnapshot(silent: boolean): SaveSnapshot {
    return {
      markdown: markdownRef.current,
      title: noteTitleRef.current,
      frames: framesRef.current,
      pageUrl: pageUrlRef.current,
      existingFileName: existingVaultFileNameRef.current,
      baseContent: lastKnownDiskContentRef.current,
      lastSavedMarkdown: lastSavedMarkdownRef.current,
      lastSavedTitle: lastSavedTitleRef.current,
      silent,
    };
  }

  function switchNoteContext(newTitle: string, newUrl: string) {
    const prevUrl = pageUrlRef.current;
    const prevTitle = noteTitleRef.current;

    // 1. Flush pending buffered captions and queue unsaved outgoing note save before resetting state
    if (prevUrl && prevUrl.split('#')[0] !== newUrl.split('#')[0]) {
      flushCaptionsRef.current?.();

      const hasContent = Boolean(markdownRef.current.trim() || framesRef.current.length > 0);
      const isDirty =
        markdownRef.current !== lastSavedMarkdownRef.current ||
        prevTitle !== lastSavedTitleRef.current ||
        framesRef.current.some((f) => !savedFrameIdsRef.current.has(f.id));

      if (hasContent && isDirty) {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          const prevSessionKey = 'session_' + (prevUrl.split('#')[0] || prevTitle);
          chrome.storage.local.set({
            [prevSessionKey]: {
              markdown: markdownRef.current,
              title: prevTitle,
              url: prevUrl,
              updatedAt: Date.now(),
            },
          }).catch(() => {});
        }
        // Snapshot outgoing note synchronously and serialize onto saveQueueRef so in-flight saves never drop it
        const outgoingSnapshot = captureSaveSnapshot(true);
        void performSaveToVault(true, outgoingSnapshot);
      }
    }

    // 2. Unconditionally reset state and tracking refs for the new video context
    isProvisionalTitleRef.current = true;
    setNoteTitle(newTitle);
    noteTitleRef.current = newTitle;
    setPageUrl(newUrl);
    pageUrlRef.current = newUrl;
    updateMarkdown('');
    setFrames([]);
    framesRef.current = [];
    savedFrameIdsRef.current = new Set();
    lastSavedMarkdownRef.current = '';
    lastSavedTitleRef.current = newTitle;
    lastKnownDiskContentRef.current = '';
    lastKnownFileModifiedRef.current = 0;
    setExistingVaultMarkdown('');
    setExistingVaultFileName(null);
    existingVaultFileNameRef.current = null;
    setHasUnsavedChanges(false);
    setLiveVideoTime(null);
    setSavedVideoPosition(null);

    // 3. Load vault / session note for the new video
    void checkAndLoadExistingNote(newTitle, newUrl);
  }

  // Load saved API key, model, and vault on initialization
  useEffect(() => {
    getGeminiApiKey().then((savedKey) => {
      if (savedKey) setApiKey(savedKey);
    });

    getGeminiModel().then((savedModel) => {
      if (savedModel) setSelectedModel(savedModel);
    });

    getSavedVaultName().then((name) => {
      if (name) setVaultName(name);
    });

    checkVaultPermissionStatus().then((perm) => {
      if (perm === 'prompt' || perm === 'denied') {
        setVaultPermissionNeeded(true);
      } else if (perm === 'granted') {
        setVaultPermissionNeeded(false);
      }
    });

    if (typeof chrome !== 'undefined' && chrome.windows?.getCurrent) {
      chrome.windows.getCurrent().then((win) => {
        if (win?.id !== undefined) currentWindowIdRef.current = win.id;
      }).catch(() => {});
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['auto_save_enabled'], (res) => {
        if (res && res.auto_save_enabled !== undefined) {
          setAutoSaveEnabled(Boolean(res.auto_save_enabled));
        }
      });
    }

    const isVideoOrNoteTab = async (tab: chrome.tabs.Tab): Promise<boolean> => {
      if (!tab?.url || isIgnoredBrowserUrl(tab.url)) return false;
      // On initial startup with no note context yet, adopt the active tab
      if (!pageUrlRef.current) return true;
      if (isKnownVideoUrl(tab.url)) return true;

      if (tab.id && typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
        try {
          const state = await chrome.tabs.sendMessage<ExtensionMessage, VideoStateResponse>(
            tab.id,
            { type: 'GET_VIDEO_STATE' }
          );
          if (state?.ok) return true;
        } catch {
          // Content script unavailable or no video on page
        }
      }

      try {
        const dirHandle = await getSavedVaultDirectory(false);
        if (dirHandle) {
          const rawTitle = tab.title ? tab.title.replace(/ - YouTube$/, '').trim() : '';
          const searchTitle =
            rawTitle === 'Video Notes' || rawTitle === noteTitleRef.current ? '' : rawTitle;
          const match = await findExistingNote(dirHandle, searchTitle, tab.url);
          if (match) return true;
        }
      } catch {
        // Ignored
      }

      return false;
    };

    const syncActiveTab = (tab: chrome.tabs.Tab, forceProvisionalTitle = false) => {
      if (!tab?.url || isIgnoredBrowserUrl(tab.url)) return;
      const rawTitle = forceProvisionalTitle ? '' : tab.title;
      const tTitle = rawTitle ? rawTitle.replace(/ - YouTube$/, '').trim() || 'Video Notes' : 'Video Notes';
      const tUrl = tab.url;

      switchNoteContext(tTitle, tUrl);

      if (tab.id) {
        chrome.tabs.sendMessage<ExtensionMessage, VideoStateResponse>(tab.id, {
          type: 'GET_VIDEO_STATE',
        }).then((state) => {
          if (pageUrlRef.current.split('#')[0] !== tUrl.split('#')[0]) return;
          if (state?.ok && state.currentTime !== undefined) {
            setLiveVideoTime({
              currentTime: state.currentTime,
              formattedTime: state.formattedTime || formatSeconds(state.currentTime),
              duration: state.duration || 0,
              paused: state.paused,
            });
          }
        }).catch(() => {});
      }
    };

    // Check active tab info if in extension environment
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab) syncActiveTab(tab);
      }).catch(() => {});
    }

    // Listen for tab switching / activation (ignore non-video reference tabs once an active note is open)
    const tabActivatedListener = (activeInfo: chrome.tabs.TabActiveInfo) => {
      if (currentWindowIdRef.current !== undefined && activeInfo.windowId !== currentWindowIdRef.current) {
        return;
      }
      if (typeof chrome !== 'undefined' && chrome.tabs?.get) {
        const switchSeq = ++tabSwitchSeqRef.current;
        chrome.tabs.get(activeInfo.tabId).then(async (tab) => {
          if (switchSeq !== tabSwitchSeqRef.current) return;
          if (!tab?.url || isIgnoredBrowserUrl(tab.url)) return;
          if (tab.url.split('#')[0] === pageUrlRef.current.split('#')[0]) return;
          const shouldSwitch = await isVideoOrNoteTab(tab);
          if (!shouldSwitch || switchSeq !== tabSwitchSeqRef.current) return;
          if (tab.url.split('#')[0] === pageUrlRef.current.split('#')[0]) return;
          syncActiveTab(tab);
        }).catch(() => {});
      }
    };

    // Listen for tab URL updates (e.g. video navigation)
    const tabUpdatedListener = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (!tab.active) return;
      if (currentWindowIdRef.current !== undefined && tab.windowId !== currentWindowIdRef.current) {
        return;
      }
      if (
        changeInfo.title &&
        tab.url &&
        tab.url.split('#')[0] === pageUrlRef.current.split('#')[0] &&
        isProvisionalTitleRef.current
      ) {
        const cleaned = changeInfo.title.replace(/ - YouTube$/, '').trim();
        if (cleaned && cleaned !== noteTitleRef.current) {
          setNoteTitle(cleaned);
          noteTitleRef.current = cleaned;
        }
      }
      if (changeInfo.status === 'complete' || changeInfo.url) {
        if (!tab.url || isIgnoredBrowserUrl(tab.url)) return;
        if (tab.url.split('#')[0] === pageUrlRef.current.split('#')[0]) return;
        const switchSeq = ++tabSwitchSeqRef.current;
        const outgoingTitle = noteTitleRef.current;
        const provisionalOnUrlChange = Boolean(
          changeInfo.url && !changeInfo.title && pageUrlRef.current
        );
        void isVideoOrNoteTab(tab).then(async (shouldSwitch) => {
          if (!shouldSwitch || switchSeq !== tabSwitchSeqRef.current) return;
          if (!tab.url || tab.url.split('#')[0] === pageUrlRef.current.split('#')[0]) return;
          let latestTab = tab;
          if (provisionalOnUrlChange && tab.id && typeof chrome !== 'undefined' && chrome.tabs?.get) {
            latestTab = await chrome.tabs.get(tab.id).catch(() => tab);
            if (switchSeq !== tabSwitchSeqRef.current) return;
          }
          const cleanedLatestTitle = (latestTab.title || '').replace(/ - YouTube$/, '').trim();
          const useProvisionalTitle =
            provisionalOnUrlChange &&
            (latestTab.status === 'loading' ||
              !cleanedLatestTitle ||
              cleanedLatestTitle === outgoingTitle);
          syncActiveTab(latestTab, useProvisionalTitle);
        });
      }
    };

    if (typeof chrome !== 'undefined' && chrome.tabs?.onActivated) {
      chrome.tabs.onActivated.addListener(tabActivatedListener);
    }
    if (typeof chrome !== 'undefined' && chrome.tabs?.onUpdated) {
      chrome.tabs.onUpdated.addListener(tabUpdatedListener);
    }

    // Listen for background hotkey broadcasts and real-time video playback updates
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const messageListener = (msg: ExtensionMessage, sender?: chrome.runtime.MessageSender) => {
        if (msg.type === 'HOTKEY_COMMAND') {
          if (msg.command === 'capture_frame') hotkeyHandlersRef.current?.handleCaptureFrame();
          if (msg.command === 'insert_timestamp') hotkeyHandlersRef.current?.handleInsertTimestamp();
          if (msg.command === 'toggle_play') hotkeyHandlersRef.current?.handleTogglePlay();
          return;
        }
        if (msg.type === 'VIDEO_TIME_UPDATE') {
          if (sender?.tab) {
            if (!sender.tab.active) return;
            if (currentWindowIdRef.current !== undefined && sender.tab.windowId !== currentWindowIdRef.current) {
              return;
            }
          }

          // Only top-level frame changes should trigger SPA page context switches
          const isTopFrame = !sender?.frameId || sender.frameId === 0;
          if (
            isTopFrame &&
            msg.pageUrl &&
            pageUrlRef.current &&
            msg.pageUrl.split('#')[0] !== pageUrlRef.current.split('#')[0]
          ) {
            const newUrl = msg.pageUrl;
            const rawSpaTitle = (msg.pageTitle || '').replace(/ - YouTube$/, '').trim();
            // If SPA navigation still carries the outgoing video's title, start provisional so real title updates cleanly
            const newTitle =
              rawSpaTitle && rawSpaTitle !== noteTitleRef.current ? rawSpaTitle : 'Video Notes';
            switchNoteContext(newTitle, newUrl);
          } else if (
            isTopFrame &&
            msg.pageTitle &&
            isProvisionalTitleRef.current &&
            (!msg.pageUrl || msg.pageUrl.split('#')[0] === pageUrlRef.current.split('#')[0])
          ) {
            const cleaned = msg.pageTitle.replace(/ - YouTube$/, '').trim();
            if (cleaned && cleaned !== noteTitleRef.current) {
              setNoteTitle(cleaned);
              noteTitleRef.current = cleaned;
            }
          }

          setLiveVideoTime({
            currentTime: msg.currentTime,
            formattedTime: msg.formattedTime,
            duration: msg.duration,
            paused: msg.paused,
          });
          setSavedVideoPosition({
            currentTime: msg.currentTime,
            formattedTime: msg.formattedTime,
            duration: msg.duration,
            updatedAt: Date.now(),
          });
        }
      };
      chrome.runtime.onMessage.addListener(messageListener);

      return () => {
        if (typeof chrome !== 'undefined' && chrome.tabs?.onActivated) {
          chrome.tabs.onActivated.removeListener(tabActivatedListener);
        }
        if (typeof chrome !== 'undefined' && chrome.tabs?.onUpdated) {
          chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
        }
        chrome.runtime.onMessage.removeListener(messageListener);
      };
    }
  }, []);

  // Re-acquire vault permission and detect external modifications on user interaction or window focus
  useEffect(() => {
    const handleUserInteraction = () => {
      getSavedVaultDirectory()
        .then((handle) => {
          if (handle) {
            setVaultPermissionNeeded(false);
            checkForExternalVaultModifications();
          }
        })
        .catch(() => {});
    };

    window.addEventListener('pointerdown', handleUserInteraction);
    window.addEventListener('focus', handleUserInteraction);
    return () => {
      window.removeEventListener('pointerdown', handleUserInteraction);
      window.removeEventListener('focus', handleUserInteraction);
    };
  }, []);

  function showStatus(message: string, type: 'info' | 'success' | 'error' = 'info', timeoutMs = 4000) {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    setStatus({ message, type });
    if (timeoutMs > 0) {
      statusTimerRef.current = setTimeout(() => {
        statusTimerRef.current = null;
        setStatus(null);
      }, timeoutMs);
    }
  }

  function handleToggleAutoSave(enabled: boolean) {
    setAutoSaveEnabled(enabled);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ auto_save_enabled: enabled });
    }
    showStatus(`Auto-save ${enabled ? 'enabled (2.5s after edits & 15s heartbeat)' : 'disabled'}`, 'info', 2500);
  }

  async function handleApiKeyChange(newKey: string) {
    setApiKey(newKey);
    await saveGeminiApiKey(newKey);
    showStatus('Gemini API Key saved locally.', 'success');
  }

  async function handleModelChange(newModel: string) {
    setSelectedModel(newModel);
    await saveGeminiModel(newModel);
    showStatus(`Gemini model set to ${newModel}.`, 'success');
  }

  async function handleConnectVault() {
    try {
      const handle = await selectVaultDirectory();
      setVaultName(handle.name);
      setVaultPermissionNeeded(false);
      showStatus(`Connected to Obsidian vault: ${handle.name}`, 'success');
      await checkAndLoadExistingNote(noteTitleRef.current, pageUrlRef.current);
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Folder selection canceled.', 'error');
    }
  }

  // Crop full visibleTab screenshot to the video's bounding rect (CORS fallback)
  async function cropVisibleTabToVideo(
    fullDataUrl: string,
    rect: { x: number; y: number; width: number; height: number; devicePixelRatio: number }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const dpr = rect.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(fullDataUrl);
          return;
        }
        ctx.drawImage(
          img,
          rect.x * dpr,
          rect.y * dpr,
          rect.width * dpr,
          rect.height * dpr,
          0,
          0,
          canvas.width,
          canvas.height
        );
        resolve(canvas.toDataURL('image/webp', 0.88));
      };
      img.onerror = reject;
      img.src = fullDataUrl;
    });
  }

  async function handleCaptureFrame() {
    showStatus('Capturing frame...', 'info', 0);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      showStatus('No active browser tab found.', 'error');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage<ExtensionMessage, FrameCaptureResponse>(
        tab.id,
        { type: 'CAPTURE_VIDEO_FRAME' }
      );

      if (!response?.ok) {
        showStatus(response?.error || 'Failed to capture frame.', 'error');
        return;
      }

      let finalDataUrl = response.dataUrl;

      // Execute CORS fallback if direct canvas draw was tainted
      if (response.needsFallbackCapture && response.videoRect) {
        const bgRes = await chrome.runtime.sendMessage<{ type: string }, { ok: boolean; dataUrl?: string }>({
          type: 'CAPTURE_VISIBLE_TAB',
        });
        if (bgRes?.ok && bgRes.dataUrl) {
          finalDataUrl = await cropVisibleTabToVideo(bgRes.dataUrl, response.videoRect);
        }
      }

      if (!finalDataUrl) {
        showStatus('Could not retrieve image data.', 'error');
        return;
      }

      const fileName = `frame-${Date.now()}.webp`;
      const resolvedTitle = response.pageTitle || noteTitleRef.current;
      const targetUrl = response.pageUrl || pageUrlRef.current || tab.url || '';

      const newFrame: CapturedFrame = {
        id: crypto.randomUUID(),
        fileName,
        formattedTime: response.formattedTime,
        timestamp: response.timestamp,
        dataUrl: finalDataUrl,
        pageTitle: resolvedTitle,
      };

      if (response.pageTitle && (isProvisionalTitleRef.current || !noteTitleRef.current)) {
        const cleaned = response.pageTitle.replace(/ - YouTube$/, '').trim();
        if (cleaned) {
          setNoteTitle(cleaned);
          noteTitleRef.current = cleaned;
        }
      }
      if (targetUrl && !pageUrlRef.current) {
        setPageUrl(targetUrl);
        pageUrlRef.current = targetUrl;
      }

      const nextFrames = [...framesRef.current, newFrame];
      framesRef.current = nextFrames;
      setFrames(nextFrames);

      const snippet = `\n### [${response.formattedTime}](${targetUrl}#t=${Math.floor(
        response.timestamp
      )}s)\n![[${fileName}]]\n\n`;

      updateMarkdown((prev) => prev + snippet);
      showStatus(`Captured frame at ${response.formattedTime}`, 'success');
    } catch {
      showStatus('Content script not ready. Refresh the video tab and try again.', 'error');
    }
  }

  async function handleInsertTimestamp() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showStatus('No active browser tab found.', 'error');
      return;
    }

    try {
      const state = await chrome.tabs.sendMessage<ExtensionMessage, VideoStateResponse>(
        tab.id,
        { type: 'GET_VIDEO_STATE' }
      );

      if (!state?.ok) {
        showStatus('No active video found on page.', 'error');
        return;
      }

      const targetUrl = state.pageUrl || pageUrlRef.current || tab.url || '';
      const snippet = `[${state.formattedTime}](${targetUrl}#t=${Math.floor(state.currentTime)}s) `;
      updateMarkdown((prev) => prev + snippet);
      showStatus(`Inserted timestamp [${state.formattedTime}]`, 'success');
    } catch {
      showStatus('Unable to reach video player.', 'error');
    }
  }

  async function handleTogglePlay() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      const res = await chrome.tabs.sendMessage<ExtensionMessage, { ok: boolean; paused?: boolean }>(
        tab.id,
        { type: 'TOGGLE_PLAY' }
      );
      if (res?.ok && res.paused !== undefined) {
        setIsPlaying(!res.paused);
      }
    } catch {
      // Ignored
    }
  }

  hotkeyHandlersRef.current = {
    handleCaptureFrame,
    handleInsertTimestamp,
    handleTogglePlay,
  };

  async function handleSeek(timestamp: number) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.tabs.sendMessage<ExtensionMessage>(tab.id, {
      type: 'SEEK_VIDEO',
      timestamp,
    });
    showStatus(`Jumped to ${Math.floor(timestamp)}s`, 'info', 2000);
  }

  async function handleAnalyzeFrame(frame: CapturedFrame) {
    if (!apiKey.trim()) {
      showStatus('Enter your Gemini API key in Settings first.', 'error');
      setIsSettingsOpen(true);
      return;
    }

    setAnalyzingFrameId(frame.id);
    showStatus(`Analyzing ${frame.fileName} with Gemini...`, 'info', 0);

    try {
      const explanation = await analyzeVideoFrameWithGemini({
        apiKey,
        model: selectedModel,
        dataUrl: frame.dataUrl,
        formattedTime: frame.formattedTime,
        pageTitle: frame.pageTitle,
      });

      const imageEmbedToken = `![[${frame.fileName}]]`;
      const calloutBlock = `\n> [!info] AI Frame Analysis (${frame.formattedTime})\n> ${explanation.replace(
        /\n/g,
        '\n> '
      )}\n`;

      setMarkdown((prev) => {
        const next = prev.includes(imageEmbedToken)
          ? prev.replace(imageEmbedToken, `${imageEmbedToken}\n${calloutBlock}`)
          : `${prev}\n${calloutBlock}`;
        markdownRef.current = next;
        return next;
      });

      showStatus(`Added AI visual explanation for frame ${frame.formattedTime}.`, 'success');
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Frame analysis failed.', 'error');
    } finally {
      setAnalyzingFrameId(null);
    }
  }

  async function handleSummarizeTranscript() {
    if (!apiKey.trim()) {
      showStatus('Enter your Gemini API key in Settings first.', 'error');
      setIsSettingsOpen(true);
      return;
    }

    setIsSummarizing(true);
    showStatus('Extracting video captions...', 'info', 0);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setIsSummarizing(false);
      showStatus('No active browser tab found.', 'error');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage<ExtensionMessage, TranscriptResponse>(
        tab.id,
        { type: 'EXTRACT_TRANSCRIPT' }
      );

      if (!response?.ok || response.segments.length === 0) {
        setIsSummarizing(false);
        showStatus(response?.error || 'Could not extract transcript.', 'error');
        return;
      }

      if (response.pageTitle && (isProvisionalTitleRef.current || noteTitleRef.current === 'Video Notes')) {
        const cleaned = response.pageTitle.replace(/ - YouTube$/, '').trim();
        if (cleaned) {
          setNoteTitle(cleaned);
          noteTitleRef.current = cleaned;
        }
      }

      showStatus(`Summarizing ${response.segments.length} segments with Gemini...`, 'info', 0);

      const summaryMarkdown = await summarizeTranscriptToMarkdown({
        apiKey,
        model: selectedModel,
        pageTitle: response.pageTitle || noteTitleRef.current,
        pageUrl: response.pageUrl || pageUrlRef.current || tab.url || '',
        segments: response.segments,
      });

      updateMarkdown((prev) => (prev ? `${prev}\n\n---\n\n${summaryMarkdown}` : summaryMarkdown));
      showStatus('Transcript study summary added to notes.', 'success');
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Summarization failed.', 'error');
    } finally {
      setIsSummarizing(false);
    }
  }

  function performSaveToVault(silent = false, explicitSnapshot?: SaveSnapshot): Promise<void> {
    const initialSnapshot = explicitSnapshot ?? captureSaveSnapshot(silent);
    const initialContextUrl = initialSnapshot.pageUrl.split('#')[0];

    const runSave = async () => {
      const snapshot = explicitSnapshot ?? captureSaveSnapshot(silent);

      // If an implicit save waited behind an earlier save and context already switched away, skip it
      if (!explicitSnapshot && snapshot.pageUrl.split('#')[0] !== initialContextUrl) {
        return;
      }

      const {
        markdown: currentMarkdown,
        title: currentTitle,
        frames: currentFrames,
        pageUrl: currentPageUrl,
        existingFileName: currentExistingFileName,
        baseContent: snapshotBaseContent,
        lastSavedMarkdown: snapshotLastSavedMarkdown,
        lastSavedTitle: snapshotLastSavedTitle,
        silent: isSilent,
      } = snapshot;
      const saveContextUrl = currentPageUrl.split('#')[0];

      // Skip silent auto-save if note is clean and has no unsaved changes
      if (
        isSilent &&
        currentMarkdown === snapshotLastSavedMarkdown &&
        currentTitle === snapshotLastSavedTitle &&
        currentFrames.every((f) => savedFrameIdsRef.current.has(f.id))
      ) {
        return;
      }

      // Skip if note is empty
      if (!currentMarkdown.trim() && currentFrames.length === 0) return;

      let dirHandle: FileSystemDirectoryHandle | null = null;
      try {
        dirHandle = await getSavedVaultDirectory(!isSilent);
      } catch {
        // Ignore background permission queries
      }

      if (!dirHandle) {
        if (!isSilent) {
          try {
            dirHandle = await reauthorizeVault();
            if (dirHandle) {
              setVaultName(dirHandle.name);
              setVaultPermissionNeeded(false);
            }
          } catch (err) {
            showStatus(err instanceof Error ? err.message : 'Folder selection canceled.', 'error');
            return;
          }
        } else {
          setVaultPermissionNeeded(true);
          // Continuously mirror to chrome.storage.local so zero edits are lost
          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            const cleanKey = 'session_' + (saveContextUrl || currentTitle);
            chrome.storage.local.set({
              [cleanKey]: {
                markdown: currentMarkdown,
                title: currentTitle,
                url: currentPageUrl,
                updatedAt: Date.now(),
              },
            }).catch(() => {});
          }
          return;
        }
      }

      if (!dirHandle) return;
      if (pageUrlRef.current.split('#')[0] === saveContextUrl) {
        setVaultPermissionNeeded(false);
      }

      isSavingRef.current = true;
      setIsSaving(true);
      if (!isSilent) {
        showStatus('Saving to Obsidian vault...', 'info', 0);
      }

      try {
        // 1. Only write new frames that haven't been saved to disk yet
        for (const frame of currentFrames) {
          if (!savedFrameIdsRef.current.has(frame.id)) {
            await saveBinaryAttachment(dirHandle, frame.fileName, frame.dataUrl);
            savedFrameIdsRef.current.add(frame.id);
          }
        }

        // 2. Format content with frontmatter if not already present
        const fullContent = currentMarkdown.startsWith('---')
          ? currentMarkdown
          : generateObsidianFrontmatter({
              title: currentTitle,
              sourceUrl: currentPageUrl,
              tags: ['video-notes', 'study'],
            }) + currentMarkdown;

        // Determine target file name from synchronized snapshot: avoid duplicating matched notes
        const targetFileName = currentExistingFileName
          ? currentExistingFileName.replace(/\.md$/, '')
          : currentTitle;

        const resolvedBaseContent = lastSavedDiskByUrlRef.current.get(saveContextUrl) ?? snapshotBaseContent;

        // 3. Write markdown file to Obsidian vault with optimistic concurrency control
        const saveResult = await saveMarkdownFileNonDestructive(
          dirHandle,
          targetFileName,
          fullContent,
          {
            allowOverwrite: false,
            baseContent: resolvedBaseContent,
          }
        );

        lastSavedDiskByUrlRef.current.set(saveContextUrl, saveResult.finalContent);

        // Persist session snapshot for this note's URL even if panel switched mid-save
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          const cleanKey = 'session_' + (saveContextUrl || currentTitle);
          chrome.storage.local.set({
            [cleanKey]: {
              markdown: saveResult.finalContent,
              title: currentTitle,
              url: currentPageUrl,
              updatedAt: saveResult.lastModified || Date.now(),
            },
          });
        }

        const isStillSameContext = pageUrlRef.current.split('#')[0] === saveContextUrl;
        if (isStillSameContext) {
          setExistingVaultMarkdown(saveResult.finalContent);
          setExistingVaultFileName(`${targetFileName}.md`);
          existingVaultFileNameRef.current = `${targetFileName}.md`;
          lastKnownDiskContentRef.current = saveResult.finalContent;
          lastKnownFileModifiedRef.current = saveResult.lastModified;

          if (saveResult.wasMerged) {
            updateMarkdown(saveResult.finalContent);
            lastSavedMarkdownRef.current = saveResult.finalContent;
          } else {
            lastSavedMarkdownRef.current = saveResult.finalContent;
          }

          lastSavedTitleRef.current = currentTitle;
          setLastSavedTime(new Date());
          setVaultPermissionNeeded(false);
          setHasUnsavedChanges(false);

          if (!isSilent) {
            showStatus(
              saveResult.wasMerged
                ? `Safely merged with existing Obsidian note (zero data loss).`
                : `Saved "${targetFileName}.md" and ${currentFrames.length} images to ${dirHandle.name}.`,
              'success'
            );
          }
        }
      } catch (err) {
        if (!isSilent) {
          showStatus(err instanceof Error ? err.message : 'Failed to save to local folder.', 'error');
        } else {
          console.warn('Auto-save encountered error:', err);
          const errStr = String(err);
          if (errStr.includes('permission') || errStr.includes('NotAllowedError') || errStr.includes('SecurityError')) {
            setVaultPermissionNeeded(true);
          }
        }
      } finally {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    };

    const nextPromise = saveQueueRef.current.then(runSave, runSave);
    saveQueueRef.current = nextPromise;
    return nextPromise;
  }

  // Detect unsaved changes
  useEffect(() => {
    const hasContent = Boolean(markdown.trim() || frames.length > 0);
    const isDirty =
      hasContent &&
      (markdown !== lastSavedMarkdownRef.current ||
        noteTitle !== lastSavedTitleRef.current ||
        frames.some((f) => !savedFrameIdsRef.current.has(f.id)));
    setHasUnsavedChanges(isDirty);
  }, [markdown, noteTitle, frames]);

  // Debounced auto-save (triggers 2.5s after editing/inserting content)
  useEffect(() => {
    if (!autoSaveEnabled || !vaultName) return;
    if (!markdown.trim() && frames.length === 0) return;
    if (
      markdown === lastSavedMarkdownRef.current &&
      noteTitle === lastSavedTitleRef.current &&
      frames.every((f) => savedFrameIdsRef.current.has(f.id))
    ) {
      return;
    }

    const timer = setTimeout(() => {
      performSaveToVault(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [markdown, noteTitle, frames, autoSaveEnabled, vaultName]);

  // Periodic 15-second heartbeat auto-save (guarantees continuous live streams commit to disk)
  useEffect(() => {
    if (!autoSaveEnabled || !vaultName) return;

    const interval = setInterval(() => {
      const isDirty =
        markdownRef.current !== lastSavedMarkdownRef.current ||
        noteTitleRef.current !== lastSavedTitleRef.current ||
        framesRef.current.some((f) => !savedFrameIdsRef.current.has(f.id));

      if (isDirty && (markdownRef.current.trim() || framesRef.current.length > 0)) {
        performSaveToVault(true);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [autoSaveEnabled, vaultName]);

  function handleDeleteFrame(frameId: string) {
    const nextFrames = framesRef.current.filter((f) => f.id !== frameId);
    framesRef.current = nextFrames;
    setFrames(nextFrames);
    showStatus('Frame removed.', 'info', 2000);
  }

  function handleApplyTemplate() {
    const templateContent = generateTemplate({
      type: selectedTemplate,
      title: noteTitleRef.current,
      sourceUrl: pageUrlRef.current,
    });
    updateMarkdown((prev) => (prev.trim() ? `${templateContent}\n${prev}` : templateContent));
    showStatus(`Applied ${selectedTemplate} template to notes.`, 'success');
  }

  function handleOpenInObsidian() {
    if (!vaultName) {
      showStatus('Select an Obsidian vault first.', 'info');
      handleConnectVault();
      return;
    }
    const fileName = existingVaultFileName || `${noteTitle}.md`;
    openNoteInObsidian(vaultName, fileName);
    showStatus(`Opening "${fileName}" in Obsidian...`, 'info', 2500);
  }

  function handleExportMarkdown() {
    const fileName = existingVaultFileName || `${noteTitle}.md`;
    const fullContent = markdownRef.current.startsWith('---')
      ? markdownRef.current
      : generateObsidianFrontmatter({
          title: noteTitleRef.current,
          sourceUrl: pageUrlRef.current,
          tags: ['video-notes', 'study'],
        }) + markdownRef.current;
    downloadMarkdownFile(fileName, fullContent);
    showStatus(`Exported "${fileName}" to downloads.`, 'success', 2500);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)' }}>
      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <input
          type="text"
          className="input-field"
          value={noteTitle}
          onChange={(e) => {
            isProvisionalTitleRef.current = false;
            setNoteTitle(e.target.value);
            noteTitleRef.current = e.target.value;
          }}
          placeholder="Note Title"
          style={{
            fontWeight: 600,
            fontSize: '13px',
            border: 'none',
            background: 'transparent',
            padding: '4px 6px',
            color: '#fff',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {vaultPermissionNeeded && (
            <button
              className="btn"
              onClick={() => performSaveToVault(false)}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                borderColor: '#ef4444',
                color: '#fca5a5',
                fontSize: '11px',
                padding: '2px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Vault permission needed. Click to re-authorize and resume auto-saving."
            >
              <AlertCircle size={11} color="#f87171" />
              <span>Re-authorize</span>
            </button>
          )}

          {vaultName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
              {isSaving ? (
                <span style={{ color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <RefreshCw size={11} className="spin" />
                  <span>Saving...</span>
                </span>
              ) : hasUnsavedChanges ? (
                <span
                  style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '3px' }}
                  title="Unsaved changes (auto-saves 2.5s after edits & 15s heartbeat)"
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fbbf24', display: 'inline-block' }} />
                  <span>Unsaved</span>
                </span>
              ) : lastSavedTime ? (
                <span
                  style={{ color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '3px' }}
                  title={`Saved to vault at ${lastSavedTime.toLocaleTimeString()}`}
                >
                  <Check size={11} />
                  <span>Saved</span>
                </span>
              ) : null}
            </div>
          )}

          <button
            className={`badge ${vaultName ? 'badge-connected' : 'badge-disconnected'}`}
            onClick={vaultName ? () => setIsSettingsOpen(true) : handleConnectVault}
            style={{ cursor: 'pointer', border: 'none' }}
            title={vaultName ? `📁 Vault: ${vaultName} (Click to configure)` : 'Click to connect Obsidian Vault'}
          >
            {vaultName ? `📁 ${vaultName}` : '📁 Connect Vault'}
          </button>
        </div>
      </div>

      {/* Main Action Toolbar */}
      <Toolbar
        onCaptureFrame={handleCaptureFrame}
        onInsertTimestamp={handleInsertTimestamp}
        onTogglePlay={handleTogglePlay}
        onSummarizeTranscript={handleSummarizeTranscript}
        onSaveToVault={() => performSaveToVault(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenReview={() => setIsReviewOpen(true)}
        onOpenInObsidian={handleOpenInObsidian}
        onExportMarkdown={handleExportMarkdown}
        timestampsCount={timestamps.length}
        isPreviewMode={isPreviewMode}
        onTogglePreview={() => setIsPreviewMode(!isPreviewMode)}
        isPlaying={isPlaying}
        isSummarizing={isSummarizing}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        vaultName={vaultName}
      />

      {/* Timestamps & Resume Strip */}
      {(timestamps.length > 0 || resumeTarget || (liveVideoTime && liveVideoTime.currentTime > 0)) && (
        <div
          style={{
            padding: '4px 10px',
            background: 'rgba(99, 102, 241, 0.08)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ color: '#fff', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={11} color="var(--accent-primary)" />
              <span>{timestamps.length} timestamp{timestamps.length === 1 ? '' : 's'}</span>
            </span>

            {liveVideoTime && liveVideoTime.currentTime > 0 && (
              <>
                <span style={{ color: 'var(--text-subtle)' }}>•</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  Playback: <strong style={{ color: '#38bdf8' }}>{liveVideoTime.formattedTime}</strong>
                </span>
              </>
            )}

            {lastRecordedNote && (
              <>
                <span style={{ color: 'var(--text-subtle)' }}>•</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  Last note: <strong style={{ color: '#fff' }}>{lastRecordedNote.formattedTime}</strong>
                </span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {resumeTarget && (
              <button
                className="btn btn-primary"
                onClick={() => handleSeek(resumeTarget.seconds)}
                style={{ padding: '2px 8px', fontSize: '10.5px', height: '22px' }}
                title={`Seek video playhead to ${resumeTarget.formattedTime}`}
              >
                <Play size={10} fill="currentColor" />
                <span>Resume at {resumeTarget.formattedTime}</span>
              </button>
            )}

            <button
              className="btn"
              onClick={() => setIsReviewOpen(true)}
              style={{ padding: '2px 8px', fontSize: '10.5px', height: '22px' }}
            >
              <BookOpen size={11} />
              <span>Review Note</span>
            </button>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-glass)',
        }}
      >
        <button
          className="btn"
          onClick={() => setActiveTab('editor')}
          style={{
            flex: 1,
            borderRadius: 0,
            border: 'none',
            borderBottom: activeTab === 'editor' ? '2px solid var(--accent-primary)' : 'none',
            color: activeTab === 'editor' ? '#fff' : 'var(--text-muted)',
            background: activeTab === 'editor' ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
            padding: '7px 0',
          }}
        >
          <FileText size={13} />
          <span>Notes {isPreviewMode ? '(Preview)' : '(Edit)'}</span>
        </button>

        <button
          className="btn"
          onClick={() => setActiveTab('gallery')}
          style={{
            flex: 1,
            borderRadius: 0,
            border: 'none',
            borderBottom: activeTab === 'gallery' ? '2px solid var(--accent-primary)' : 'none',
            color: activeTab === 'gallery' ? '#fff' : 'var(--text-muted)',
            background: activeTab === 'gallery' ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
            padding: '7px 0',
          }}
        >
          <Image size={13} />
          <span>Frames ({frames.length})</span>
        </button>

        <button
          className="btn"
          onClick={() => setActiveTab('captions')}
          style={{
            flex: 1,
            borderRadius: 0,
            border: 'none',
            borderBottom: activeTab === 'captions' ? '2px solid var(--accent-primary)' : 'none',
            color: activeTab === 'captions' ? '#fff' : 'var(--text-muted)',
            background: activeTab === 'captions' ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
            padding: '7px 0',
          }}
        >
          <Radio size={13} />
          <span>Captions</span>
        </button>

        <button
          className="btn"
          onClick={() => setActiveTab('chat')}
          style={{
            flex: 1,
            borderRadius: 0,
            border: 'none',
            borderBottom: activeTab === 'chat' ? '2px solid var(--accent-primary)' : 'none',
            color: activeTab === 'chat' ? '#fff' : 'var(--text-muted)',
            background: activeTab === 'chat' ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
            padding: '7px 0',
          }}
        >
          <MessageSquare size={13} />
          <span>Gemini AI</span>
        </button>
      </div>

      {/* Main Tab Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: activeTab === 'editor' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%' }}>
          <Editor
            markdown={markdown}
            onChange={updateMarkdown}
            isPreviewMode={isPreviewMode}
            onSeek={handleSeek}
            framesMap={framesMap}
          />
        </div>

        <div style={{ display: activeTab === 'gallery' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%' }}>
          <FrameGallery
            frames={frames}
            onSeek={handleSeek}
            onAnalyzeFrame={handleAnalyzeFrame}
            onDeleteFrame={handleDeleteFrame}
            analyzingFrameId={analyzingFrameId}
          />
        </div>

        <div style={{ display: activeTab === 'captions' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%' }}>
          <LiveCaptionsTab
            onInsertIntoNotes={(text) => {
              updateMarkdown((prev) => (prev ? `${prev}${text}` : text.trimStart()));
              showStatus('Appended live transcript to notes.', 'success', 2000);
            }}
            onRegisterFlush={(flushFn) => {
              flushCaptionsRef.current = flushFn;
            }}
            onSeek={handleSeek}
            pageUrl={pageUrl}
            onSummarizeWithAI={async (transcript) => {
              if (!apiKey.trim()) {
                showStatus('Enter your Gemini API key in Settings first.', 'error');
                setIsSettingsOpen(true);
                return;
              }
              showStatus('Summarizing live captions with Gemini...', 'info', 0);
              try {
                const segments = transcript.split('\n').filter(Boolean).map((line, idx) => {
                  const match = line.match(/^\[(.*?)\]\s*(.*)$/);
                  const formattedTime = match ? match[1] : '00:00';
                  const text = match ? match[2] : line;
                  return {
                    startTime: idx * 5,
                    formattedTime,
                    text,
                  };
                });
                const summaryMarkdown = await summarizeTranscriptToMarkdown({
                  apiKey,
                  model: selectedModel,
                  pageTitle: noteTitleRef.current,
                  pageUrl: pageUrlRef.current,
                  segments,
                });
                updateMarkdown((prev) => (prev ? `${prev}\n\n---\n\n${summaryMarkdown}` : summaryMarkdown));
                showStatus('Live transcript summary added to notes.', 'success');
                setActiveTab('editor');
              } catch (err) {
                showStatus(err instanceof Error ? err.message : 'Summarization failed.', 'error');
              }
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        </div>

        <div style={{ display: activeTab === 'chat' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%' }}>
          <AIAssistant
            apiKey={apiKey}
            model={selectedModel}
            pageTitle={noteTitle}
            pageUrl={pageUrl}
            markdown={markdown}
            frames={frames}
            onInsertIntoNotes={(text) => updateMarkdown((prev) => prev + text)}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        </div>
      </div>

      {/* Persistent Status Toast Bar */}
      {status && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            fontSize: '11.5px',
            background:
              status.type === 'error'
                ? 'rgba(244, 63, 94, 0.15)'
                : status.type === 'success'
                ? 'rgba(16, 185, 129, 0.15)'
                : 'rgba(99, 102, 241, 0.15)',
            color:
              status.type === 'error'
                ? '#fb7185'
                : status.type === 'success'
                ? '#34d399'
                : '#a5b4fc',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          {status.type === 'error' ? (
            <AlertCircle size={13} />
          ) : status.type === 'success' ? (
            <CheckCircle size={13} />
          ) : (
            <Info size={13} />
          )}
          <span style={{ flex: 1 }}>{status.message}</span>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          apiKey={apiKey}
          onApiKeyChange={handleApiKeyChange}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          vaultName={vaultName}
          onConnectVault={handleConnectVault}
          selectedTemplate={selectedTemplate}
          onSelectTemplate={setSelectedTemplate}
          onApplyTemplate={handleApplyTemplate}
          autoSaveEnabled={autoSaveEnabled}
          onToggleAutoSave={handleToggleAutoSave}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {/* Review Obsidian Note & Timestamps Modal */}
      {isReviewOpen && (
        <ReviewNoteModal
          noteTitle={noteTitle}
          vaultName={vaultName}
          savedMarkdown={existingVaultMarkdown}
          editorMarkdown={markdown}
          timestamps={timestamps}
          framesMap={framesMap}
          lastSavedTime={lastSavedTime}
          hasUnsavedChanges={hasUnsavedChanges}
          resumeTarget={resumeTarget}
          currentVideoTime={liveVideoTime?.formattedTime}
          onSeek={handleSeek}
          onLoadFromVault={() => checkAndLoadExistingNote(noteTitle, pageUrl, true)}
          onMergeWithVault={() => performSaveToVault(false)}
          onInsertSnippet={(text) => updateMarkdown((prev) => prev + text)}
          onClose={() => setIsReviewOpen(false)}
        />
      )}
    </div>
  );
}
