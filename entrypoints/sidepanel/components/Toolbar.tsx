import React from 'react';
import {
  Camera,
  Clock,
  Play,
  Pause,
  Sparkles,
  FolderDown,
  Settings,
  Eye,
  Edit3,
  Check,
  RefreshCw,
  BookOpen,
  ExternalLink,
  Download,
} from 'lucide-react';

interface ToolbarProps {
  onCaptureFrame: () => void;
  onInsertTimestamp: () => void;
  onTogglePlay: () => void;
  onSummarizeTranscript: () => void;
  onSaveToVault: () => void;
  onOpenSettings: () => void;
  onOpenReview?: () => void;
  onOpenInObsidian?: () => void;
  onExportMarkdown?: () => void;
  timestampsCount?: number;
  isPreviewMode: boolean;
  onTogglePreview: () => void;
  isPlaying: boolean;
  isSummarizing: boolean;
  isSaving: boolean;
  hasUnsavedChanges?: boolean;
  vaultName?: string | null;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onCaptureFrame,
  onInsertTimestamp,
  onTogglePlay,
  onSummarizeTranscript,
  onSaveToVault,
  onOpenSettings,
  onOpenReview,
  onOpenInObsidian,
  onExportMarkdown,
  timestampsCount = 0,
  isPreviewMode,
  onTogglePreview,
  isPlaying,
  isSummarizing,
  isSaving,
  hasUnsavedChanges = false,
  vaultName,
}) => {
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  return (
    <div
      className="scrollable-toolbar"
      onWheel={handleWheel}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 10px',
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--border-color)',
        position: 'sticky',
        top: 0,
        zIndex: 20,
        overflowX: 'auto',
        overflowY: 'hidden',
        whiteSpace: 'nowrap',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          minWidth: 'max-content',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          {onOpenReview && (
            <button
              className="btn"
              onClick={onOpenReview}
              title={`Review Obsidian Note & Timestamps (${timestampsCount} timestamps)`}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                borderColor: timestampsCount > 0 ? 'rgba(99, 102, 241, 0.4)' : 'var(--border-color)',
              }}
            >
              <BookOpen size={12} color="var(--accent-primary)" />
              <span>Review{timestampsCount > 0 ? ` (${timestampsCount})` : ''}</span>
            </button>
          )}

          <button
            className="btn btn-icon"
            onClick={onTogglePreview}
            title={isPreviewMode ? 'Switch to Markdown Edit Mode' : 'Switch to Live Preview'}
          >
            {isPreviewMode ? <Edit3 size={14} /> : <Eye size={14} />}
          </button>

          <button
            className={`btn ${hasUnsavedChanges ? 'btn-emerald' : ''}`}
            onClick={onSaveToVault}
            disabled={isSaving}
            title={
              isSaving
                ? 'Saving to Obsidian Vault...'
                : hasUnsavedChanges
                ? 'Save Unsaved Changes to Obsidian Vault'
                : 'All Changes Saved to Obsidian Vault'
            }
          >
            {isSaving ? (
              <RefreshCw size={14} className="spin" />
            ) : hasUnsavedChanges ? (
              <FolderDown size={14} />
            ) : (
              <Check size={14} color="#34d399" />
            )}
            <span>{isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save' : 'Saved'}</span>
          </button>

          {onOpenInObsidian && vaultName && (
            <button
              className="btn btn-icon"
              onClick={onOpenInObsidian}
              title={`Open active note in Obsidian app (${vaultName})`}
              style={{ color: '#a5b4fc' }}
            >
              <ExternalLink size={14} />
            </button>
          )}

          {onExportMarkdown && (
            <button
              className="btn btn-icon"
              onClick={onExportMarkdown}
              title="Download / Export Note as Markdown file"
            >
              <Download size={14} />
            </button>
          )}

          <button
            className="btn btn-icon"
            onClick={onOpenSettings}
            title="Settings & Vault Config"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
