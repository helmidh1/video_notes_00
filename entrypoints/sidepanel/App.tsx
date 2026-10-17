import React, { useEffect, useState, useMemo } from 'react';
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
  selectVaultDirectory,
  generateObsidianFrontmatter,
} from '../../utils/vaultStorage';
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
import { FileText, Image, MessageSquare, CheckCircle, AlertCircle, Info } from 'lucide-react';
import './styles/theme.css';

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_GEMINI_MODEL);
  const [noteTitle, setNoteTitle] = useState('Video Notes');
  const [markdown, setMarkdown] = useState('');
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [vaultName, setVaultName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'gallery' | 'chat'>('editor');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [analyzingFrameId, setAnalyzingFrameId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('standard');
  const [status, setStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [pageUrl, setPageUrl] = useState('');

  // Map of fileName -> dataUrl for live preview
  const framesMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of frames) {
      map.set(f.fileName, f.dataUrl);
    }
    return map;
  }, [frames]);

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

    // Check active tab info if in extension environment
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.title) {
          setNoteTitle(tab.title.replace(/ - YouTube$/, ''));
        }
        if (tab?.url) {
          setPageUrl(tab.url);
        }
      }).catch(() => {});
    }

    // Listen for background hotkey broadcasts
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const messageListener = (msg: { type: string; command?: string }) => {
        if (msg.type === 'HOTKEY_COMMAND') {
          if (msg.command === 'capture_frame') handleCaptureFrame();
          if (msg.command === 'insert_timestamp') handleInsertTimestamp();
          if (msg.command === 'toggle_play') handleTogglePlay();
        }
      };
      chrome.runtime.onMessage.addListener(messageListener);

      return () => {
        chrome.runtime.onMessage.removeListener(messageListener);
      };
    }
  }, []);

  function showStatus(message: string, type: 'info' | 'success' | 'error' = 'info', timeoutMs = 4000) {
    setStatus({ message, type });
    if (timeoutMs > 0) {
      setTimeout(() => setStatus(null), timeoutMs);
    }
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
      showStatus(`Connected to Obsidian vault: ${handle.name}`, 'success');
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

  async function handleSaveToVault() {
    setIsSaving(true);
    showStatus('Saving to Obsidian vault...', 'info', 0);

    try {
      const dirHandle = (await getSavedVaultDirectory()) || (await selectVaultDirectory());
      setVaultName(dirHandle.name);

      for (const frame of frames) {
        await saveBinaryAttachment(dirHandle, frame.fileName, frame.dataUrl);
      }

      const frontmatter = generateObsidianFrontmatter({
        title: noteTitle,
        sourceUrl: pageUrl,
        tags: ['video-notes', 'study'],
      });

      await saveMarkdownFile(dirHandle, noteTitle, frontmatter + markdown);
      showStatus(`Saved "${noteTitle}.md" and ${frames.length} images to ${dirHandle.name}.`, 'success');
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Failed to save to local folder.', 'error');
    } finally {
      setIsSaving(false);
    }
  }

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

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
        onSaveToVault={handleSaveToVault}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isPreviewMode={isPreviewMode}
        onTogglePreview={() => setIsPreviewMode(!isPreviewMode)}
        isPlaying={isPlaying}
        isSummarizing={isSummarizing}
        isSaving={isSaving}
      />

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
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
}
