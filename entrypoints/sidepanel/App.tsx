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

  const lastSavedMarkdownRef = useRef<string>('');
  const lastSavedTitleRef = useRef<string>('');
  const lastKnownDiskContentRef = useRef<string>('');
  const lastKnownFileModifiedRef = useRef<number>(0);
  const savedFrameIdsRef = useRef<Set<string>>(new Set());
  const isSavingRef = useRef<boolean>(false);
  const isCheckingVaultRef = useRef<boolean>(false);

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
    if (isCheckingVaultRef.current) return;
    const targetTitle = titleToUse || noteTitleRef.current;
    const targetUrl = urlToUse || pageUrlRef.current;

    // Load persisted video playback position from chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const cleanUrl = targetUrl.split('#')[0].replace(/[?&]t=\d+s?/, '');
      const posKey = 'video_pos_' + cleanUrl;
      chrome.storage.local.get([posKey]).then((stored) => {
        if (stored?.[posKey]) {
          setSavedVideoPosition(stored[posKey]);
        }
      }).catch(() => {});
    }

    // 1. PRIMARY SOURCE OF TRUTH: Query Obsidian vault directory first
    let dirHandle: FileSystemDirectoryHandle | null = null;
    try {
      dirHandle = await getSavedVaultDirectory();
    } catch {
      // Ignored
    }

    if (dirHandle) {
      isCheckingVaultRef.current = true;
      try {
        const match = await findExistingNote(dirHandle, targetTitle, targetUrl);
        if (match && match.content) {
          setExistingVaultMarkdown(match.content);
          setExistingVaultFileName(match.fileName);

          const foundTimestamps = parseTimestampsFromMarkdown(match.content);

          // Adopt title from frontmatter or filename if available
          const fm = extractFrontmatter(match.content);
          const resolvedTitle = fm.title || match.fileName.replace(/\.md$/, '') || targetTitle;
          if (resolvedTitle && (noteTitleRef.current === 'Video Notes' || !noteTitleRef.current)) {
            setNoteTitle(resolvedTitle);
            noteTitleRef.current = resolvedTitle;
          }

          // Populate editor with exact Obsidian file content and sync all tracking refs
          setMarkdown(match.content);
          markdownRef.current = match.content;
          lastSavedMarkdownRef.current = match.content;
          lastSavedTitleRef.current = resolvedTitle;
          lastKnownDiskContentRef.current = match.content;
          lastKnownFileModifiedRef.current = match.lastModified || Date.now();
          setHasUnsavedChanges(false);

          // Rehydrate frame attachments from vault attachments directory
          const frameNames = parseFramesFromMarkdown(match.content);
          if (frameNames.length > 0) {
            const restoredFrames: CapturedFrame[] = [];
            for (const fn of frameNames) {
              const existingFrame = framesRef.current.find((f) => f.fileName === fn);
              if (existingFrame) {
                restoredFrames.push(existingFrame);
                savedFrameIdsRef.current.add(existingFrame.id);
              } else {
                const dataUrl = await readBinaryAttachment(dirHandle, fn);
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
            if (restoredFrames.length > 0) {
              setFrames(restoredFrames);
              framesRef.current = restoredFrames;
            }
          }

          // Keep local storage session cache synchronized with latest disk content
          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            const cleanKey = 'session_' + (targetUrl.split('#')[0] || resolvedTitle);
            chrome.storage.local.set({
              [cleanKey]: {
                markdown: match.content,
                title: resolvedTitle,
                url: targetUrl,
                updatedAt: match.lastModified || Date.now(),
              },
            }).catch(() => {});
          }

          showStatus(
            `Loaded note from Obsidian (${foundTimestamps.length} timestamps).`,
            'success',
            3000
          );
          return;
        }
      } catch (err) {
        console.warn('Error checking existing note in vault:', err);
      } finally {
        isCheckingVaultRef.current = false;
      }
    }

    // 2. FALLBACK ONLY: If vault directory is unavailable or note is not in vault yet
    if (!forceReload && !markdownRef.current.trim() && typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const cleanKey = 'session_' + (targetUrl.split('#')[0] || targetTitle);
        const stored = await chrome.storage.local.get([cleanKey]);
        if (stored?.[cleanKey]?.markdown && !markdownRef.current.trim()) {
          const cached = stored[cleanKey];
          setMarkdown(cached.markdown);
          markdownRef.current = cached.markdown;
          lastSavedMarkdownRef.current = cached.markdown;
          lastSavedTitleRef.current = cached.title || targetTitle;
          setHasUnsavedChanges(false);
        }
      } catch {
        // Ignored
      }
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
      const match = await findExistingNote(dirHandle, targetTitle, targetUrl);
      if (!match || !match.content) return;

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
          setMarkdown(diskContent);
          markdownRef.current = diskContent;
          lastSavedMarkdownRef.current = diskContent;
          lastKnownDiskContentRef.current = diskContent;
          lastKnownFileModifiedRef.current = match.lastModified || Date.now();
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

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['auto_save_enabled'], (res) => {
        if (res && res.auto_save_enabled !== undefined) {
          setAutoSaveEnabled(Boolean(res.auto_save_enabled));
        }
      });
    }

    // Check active tab info if in extension environment
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        let tTitle = noteTitle;
        let tUrl = pageUrl;
        if (tab?.title) {
          tTitle = tab.title.replace(/ - YouTube$/, '');
          setNoteTitle(tTitle);
          noteTitleRef.current = tTitle;
          lastSavedTitleRef.current = tTitle;
        }
        if (tab?.url) {
          tUrl = tab.url;
          setPageUrl(tUrl);
          pageUrlRef.current = tUrl;
        }
        checkAndLoadExistingNote(tTitle, tUrl);

        if (tab?.id) {
          chrome.tabs.sendMessage<ExtensionMessage, VideoStateResponse>(tab.id, {
            type: 'GET_VIDEO_STATE',
          }).then((state) => {
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
      }).catch(() => {});
    }

    // Listen for background hotkey broadcasts and real-time video playback updates
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const messageListener = (msg: ExtensionMessage) => {
        if (msg.type === 'HOTKEY_COMMAND') {
          if (msg.command === 'capture_frame') handleCaptureFrame();
          if (msg.command === 'insert_timestamp') handleInsertTimestamp();
          if (msg.command === 'toggle_play') handleTogglePlay();
        }
        if (msg.type === 'VIDEO_TIME_UPDATE') {
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
    setStatus({ message, type });
    if (timeoutMs > 0) {
      setTimeout(() => setStatus(null), timeoutMs);
    }
  }

  function handleToggleAutoSave(enabled: boolean) {
    setAutoSaveEnabled(enabled);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ auto_save_enabled: enabled });
    }
    showStatus(`Auto-save ${enabled ? 'enabled (15s interval + on pause)' : 'disabled'}`, 'info', 2500);
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
      const resolvedTitle = response.pageTitle || noteTitle;
      const targetUrl = response.pageUrl || pageUrl || tab.url || '';

      const newFrame: CapturedFrame = {
        id: crypto.randomUUID(),
        fileName,
        formattedTime: response.formattedTime,
        timestamp: response.timestamp,
        dataUrl: finalDataUrl,
        pageTitle: resolvedTitle,
      };

      if (response.pageTitle && noteTitle === 'Video Notes') {
        setNoteTitle(response.pageTitle.replace(/ - YouTube$/, ''));
      }
      if (targetUrl) {
        setPageUrl(targetUrl);
      }

      setFrames((prev) => [...prev, newFrame]);

      const snippet = `\n### [${response.formattedTime}](${targetUrl}#t=${Math.floor(
        response.timestamp
      )}s)\n![[${fileName}]]\n\n`;

      setMarkdown((prev) => prev + snippet);
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

      const targetUrl = state.pageUrl || pageUrl || tab.url || '';
      const snippet = `[${state.formattedTime}](${targetUrl}#t=${Math.floor(state.currentTime)}s) `;
      setMarkdown((prev) => prev + snippet);
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
        if (prev.includes(imageEmbedToken)) {
          return prev.replace(imageEmbedToken, `${imageEmbedToken}\n${calloutBlock}`);
        }
        return `${prev}\n${calloutBlock}`;
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

      if (response.pageTitle && noteTitle === 'Video Notes') {
        setNoteTitle(response.pageTitle.replace(/ - YouTube$/, ''));
      }

      showStatus(`Summarizing ${response.segments.length} segments with Gemini...`, 'info', 0);

      const summaryMarkdown = await summarizeTranscriptToMarkdown({
        apiKey,
        model: selectedModel,
        pageTitle: response.pageTitle || noteTitle,
        pageUrl: response.pageUrl || pageUrl || tab.url || '',
        segments: response.segments,
      });

      setMarkdown((prev) => (prev ? `${prev}\n\n---\n\n${summaryMarkdown}` : summaryMarkdown));
      showStatus('Transcript study summary added to notes.', 'success');
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Summarization failed.', 'error');
    } finally {
      setIsSummarizing(false);
    }
  }

  async function performSaveToVault(silent = false) {
    if (isSavingRef.current) return;

    const currentMarkdown = markdownRef.current;
    const currentTitle = noteTitleRef.current;
    const currentFrames = framesRef.current;
    const currentPageUrl = pageUrlRef.current;

    // Skip silent auto-save if note is clean and has no unsaved changes
    if (
      silent &&
      currentMarkdown === lastSavedMarkdownRef.current &&
      currentTitle === lastSavedTitleRef.current &&
      currentFrames.every((f) => savedFrameIdsRef.current.has(f.id))
    ) {
      return;
    }

    // Skip if note is empty
    if (!currentMarkdown.trim() && currentFrames.length === 0) return;

    let dirHandle: FileSystemDirectoryHandle | null = null;
    try {
      dirHandle = await getSavedVaultDirectory();
    } catch {
      // Ignore background permission queries
    }

    if (!dirHandle) {
      if (!silent) {
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
        return;
      }
    }

    if (!dirHandle) return;
    setVaultPermissionNeeded(false);

    isSavingRef.current = true;
    setIsSaving(true);
    if (!silent) {
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

      // Determine target file name: prioritize matched existingVaultFileName to avoid duplicating
      const targetFileName = existingVaultFileName
        ? existingVaultFileName.replace(/\.md$/, '')
        : currentTitle;

      // 3. Write markdown file to Obsidian vault with optimistic concurrency control
      const saveResult = await saveMarkdownFileNonDestructive(
        dirHandle,
        targetFileName,
        fullContent,
        {
          allowOverwrite: false,
          baseContent: lastKnownDiskContentRef.current,
        }
      );

      setExistingVaultMarkdown(saveResult.finalContent);
      setExistingVaultFileName(`${targetFileName}.md`);
      lastKnownDiskContentRef.current = saveResult.finalContent;
      lastKnownFileModifiedRef.current = saveResult.lastModified;

      if (saveResult.wasMerged) {
        setMarkdown(saveResult.finalContent);
        markdownRef.current = saveResult.finalContent;
        lastSavedMarkdownRef.current = saveResult.finalContent;
      } else {
        lastSavedMarkdownRef.current = saveResult.finalContent;
      }

      lastSavedTitleRef.current = currentTitle;
      setLastSavedTime(new Date());
      setVaultPermissionNeeded(false);
      setHasUnsavedChanges(false);

      // Persist active session snapshot to chrome.storage.local for instant reload on extension refresh
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const cleanKey = 'session_' + (currentPageUrl.split('#')[0] || currentTitle);
        chrome.storage.local.set({
          [cleanKey]: {
            markdown: saveResult.finalContent,
            title: currentTitle,
            url: currentPageUrl,
            updatedAt: saveResult.lastModified || Date.now(),
          },
        });
      }

      if (!silent) {
        showStatus(
          saveResult.wasMerged
            ? `Safely merged with existing Obsidian note (zero data loss).`
            : `Saved "${targetFileName}.md" and ${currentFrames.length} images to ${dirHandle.name}.`,
          'success'
        );
      }
    } catch (err) {
      if (!silent) {
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
  }

  // Detect unsaved changes
  useEffect(() => {
    const isDirty =
      markdown !== lastSavedMarkdownRef.current ||
      noteTitle !== lastSavedTitleRef.current ||
      frames.some((f) => !savedFrameIdsRef.current.has(f.id));
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
    setFrames((prev) => prev.filter((f) => f.id !== frameId));
    showStatus('Frame removed.', 'info', 2000);
  }

  function handleApplyTemplate() {
    const templateContent = generateTemplate({
      type: selectedTemplate,
      title: noteTitle,
      sourceUrl: pageUrl,
    });
    setMarkdown((prev) => (prev.trim() ? `${templateContent}\n${prev}` : templateContent));
    showStatus(`Applied ${selectedTemplate} template to notes.`, 'success');
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
          onChange={(e) => setNoteTitle(e.target.value)}
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
                  title="Unsaved changes (will auto-save in 15s or on pause)"
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

          <span className={`badge ${vaultName ? 'badge-connected' : 'badge-disconnected'}`}>
            {vaultName ? `📁 ${vaultName}` : 'No Vault'}
          </span>
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
        timestampsCount={timestamps.length}
        isPreviewMode={isPreviewMode}
        onTogglePreview={() => setIsPreviewMode(!isPreviewMode)}
        isPlaying={isPlaying}
        isSummarizing={isSummarizing}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
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
        {activeTab === 'editor' && (
          <Editor
            markdown={markdown}
            onChange={setMarkdown}
            isPreviewMode={isPreviewMode}
            onSeek={handleSeek}
            framesMap={framesMap}
          />
        )}

        {activeTab === 'gallery' && (
          <FrameGallery
            frames={frames}
            onSeek={handleSeek}
            onAnalyzeFrame={handleAnalyzeFrame}
            onDeleteFrame={handleDeleteFrame}
            analyzingFrameId={analyzingFrameId}
          />
        )}

        {activeTab === 'captions' && (
          <LiveCaptionsTab
            onInsertIntoNotes={(text) => {
              setMarkdown((prev) => (prev ? `${prev}${text}` : text.trimStart()));
              showStatus('Appended live transcript to notes.', 'success', 2000);
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
                  pageTitle: noteTitle,
                  pageUrl,
                  segments,
                });
                setMarkdown((prev) => (prev ? `${prev}\n\n---\n\n${summaryMarkdown}` : summaryMarkdown));
                showStatus('Live transcript summary added to notes.', 'success');
                setActiveTab('editor');
              } catch (err) {
                showStatus(err instanceof Error ? err.message : 'Summarization failed.', 'error');
              }
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}

        {activeTab === 'chat' && (
          <AIAssistant
            apiKey={apiKey}
            model={selectedModel}
            pageTitle={noteTitle}
            pageUrl={pageUrl}
            markdown={markdown}
            frames={frames}
            onInsertIntoNotes={(text) => setMarkdown((prev) => prev + text)}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}
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
          onInsertSnippet={(text) => setMarkdown((prev) => prev + text)}
          onClose={() => setIsReviewOpen(false)}
        />
      )}
    </div>
  );
}
