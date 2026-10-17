import React from 'react';
import { Camera, Clock, Play, Pause, Sparkles, FolderDown, Settings, Eye, Edit3 } from 'lucide-react';

interface ToolbarProps {
  onCaptureFrame: () => void;
  onInsertTimestamp: () => void;
  onTogglePlay: () => void;
  onSummarizeTranscript: () => void;
  onSaveToVault: () => void;
  onOpenSettings: () => void;
  isPreviewMode: boolean;
  onTogglePreview: () => void;
  isPlaying: boolean;
  isSummarizing: boolean;
  isSaving: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onCaptureFrame,
  onInsertTimestamp,
  onTogglePlay,
  onSummarizeTranscript,
  onSaveToVault,
  onOpenSettings,
  isPreviewMode,
  onTogglePreview,
  isPlaying,
  isSummarizing,
  isSaving,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '6px',
        padding: '8px 10px',
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--border-color)',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <button
          className="btn btn-primary"
          onClick={onCaptureFrame}
          title="Capture Video Frame (Alt+S)"
        >
          <Camera size={14} />
          <span>Snap</span>
        </button>

        <button
          className="btn"
          onClick={onInsertTimestamp}
          title="Insert Current Timestamp (Alt+T)"
        >
          <Clock size={14} />
          <span>[Time]</span>
        </button>

        <button
          className="btn btn-icon"
          onClick={onTogglePlay}
          title={isPlaying ? 'Pause Video (Alt+P)' : 'Play Video (Alt+P)'}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <button
          className="btn"
          onClick={onSummarizeTranscript}
          disabled={isSummarizing}
          title="Summarize Video Transcript with Gemini"
        >
          <Sparkles size={14} color="#8b5cf6" />
          <span>{isSummarizing ? 'Thinking...' : 'AI Summary'}</span>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <button
          className="btn btn-icon"
          onClick={onTogglePreview}
          title={isPreviewMode ? 'Switch to Markdown Edit Mode' : 'Switch to Live Preview'}
        >
          {isPreviewMode ? <Edit3 size={14} /> : <Eye size={14} />}
        </button>

        <button
          className="btn btn-emerald"
          onClick={onSaveToVault}
          disabled={isSaving}
          title="Save Markdown & Images to Obsidian Vault"
        >
          <FolderDown size={14} />
          <span>{isSaving ? 'Saving...' : 'Save'}</span>
        </button>

        <button
          className="btn btn-icon"
          onClick={onOpenSettings}
          title="Settings & Vault Config"
        >
          <Settings size={14} />
        </button>
      </div>
    </div>
  );
};
