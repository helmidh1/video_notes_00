import React, { useState, useMemo } from 'react';
import {
  Clock,
  Play,
  FileText,
  Copy,
  Check,
  X,
  ExternalLink,
  RefreshCw,
  GitMerge,
  Search,
  Image,
  Sparkles,
  ChevronRight,
  BookOpen,
} from 'lucide-react';
import type { ParsedTimestamp } from '../../../utils/noteMerge';

interface ReviewNoteModalProps {
  noteTitle: string;
  vaultName: string | null;
  savedMarkdown: string;
  editorMarkdown: string;
  timestamps: ParsedTimestamp[];
  framesMap: Map<string, string>;
  lastSavedTime: Date | null;
  hasUnsavedChanges: boolean;
  resumeTarget?: { seconds: number; formattedTime: string; label?: string } | null;
  currentVideoTime?: string | null;
  onSeek: (seconds: number) => void;
  onLoadFromVault: () => void;
  onMergeWithVault: () => void;
  onInsertSnippet: (text: string) => void;
  onClose: () => void;
}

export const ReviewNoteModal: React.FC<ReviewNoteModalProps> = ({
  noteTitle,
  vaultName,
  savedMarkdown,
  editorMarkdown,
  timestamps,
  framesMap,
  lastSavedTime,
  hasUnsavedChanges,
  resumeTarget,
  currentVideoTime,
  onSeek,
  onLoadFromVault,
  onMergeWithVault,
  onInsertSnippet,
  onClose,
}) => {
  const [activeView, setActiveView] = useState<'timeline' | 'preview'>('timeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredTimestamps = useMemo(() => {
    if (!searchQuery.trim()) return timestamps;
    const q = searchQuery.toLowerCase();
    return timestamps.filter(
      (ts) =>
        ts.formattedTime.toLowerCase().includes(q) ||
        ts.context.toLowerCase().includes(q) ||
        (ts.imageFileName && ts.imageFileName.toLowerCase().includes(q))
    );
  }, [timestamps, searchQuery]);

  // Accurate resume target (prioritizes actual last video playback position, falls back to latest note)
  const effectiveResume = useMemo(() => {
    if (resumeTarget) return resumeTarget;
    if (timestamps.length === 0) return null;
    return timestamps[timestamps.length - 1];
  }, [resumeTarget, timestamps]);

  const wordCount = useMemo(() => {
    const text = savedMarkdown || editorMarkdown;
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }, [savedMarkdown, editorMarkdown]);

  function handleCopy(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(5, 7, 12, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-tertiary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={16} color="var(--accent-primary)" />
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#fff', margin: 0 }}>
                Obsidian Note & Timestamps
              </h3>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {vaultName ? `📁 Vault: ${vaultName}` : 'No vault connected'} •{' '}
                {noteTitle.replace(/[\r\n\t]/g, ' ').replace(/[<>:"/\\|?*]+/g, '-')}.md
              </div>
            </div>
          </div>
          <button
            className="btn btn-icon"
            onClick={onClose}
            style={{ width: '28px', height: '28px', padding: 0 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Stats & Resume Bar */}
        <div
          style={{
            padding: '10px 16px',
            background: 'rgba(99, 102, 241, 0.05)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11.5px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--accent-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} />
              <span>{timestamps.length} Timestamps</span>
            </span>
            {currentVideoTime && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>•</span>
                <span style={{ color: '#38bdf8' }}>
                  Video at {currentVideoTime}
                </span>
              </>
            )}
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span style={{ color: 'var(--text-muted)' }}>{wordCount} words</span>
            {lastSavedTime && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>•</span>
                <span style={{ color: 'var(--accent-emerald)' }}>
                  Saved {lastSavedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </>
            )}
          </div>

          {effectiveResume && (
            <button
              className="btn btn-primary"
              onClick={() => {
                onSeek(effectiveResume.seconds);
                onClose();
              }}
              style={{ fontSize: '11.5px', padding: '4px 10px', height: '28px' }}
              title={`Jump video playhead to ${effectiveResume.formattedTime}`}
            >
              <Play size={11} fill="currentColor" />
              <span>Resume at {effectiveResume.formattedTime}</span>
            </button>
          )}
        </div>

        {/* Sub-tabs & Search */}
        <div
          style={{
            padding: '8px 16px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className="btn"
              onClick={() => setActiveView('timeline')}
              style={{
                fontSize: '11.5px',
                padding: '4px 10px',
                background: activeView === 'timeline' ? 'var(--accent-primary)' : 'transparent',
                borderColor: activeView === 'timeline' ? 'var(--accent-primary)' : 'var(--border-color)',
                color: activeView === 'timeline' ? '#fff' : 'var(--text-muted)',
              }}
            >
              <Clock size={12} />
              <span>Timeline ({timestamps.length})</span>
            </button>

            <button
              className="btn"
              onClick={() => setActiveView('preview')}
              style={{
                fontSize: '11.5px',
                padding: '4px 10px',
                background: activeView === 'preview' ? 'var(--accent-primary)' : 'transparent',
                borderColor: activeView === 'preview' ? 'var(--accent-primary)' : 'var(--border-color)',
                color: activeView === 'preview' ? '#fff' : 'var(--text-muted)',
              }}
            >
              <FileText size={12} />
              <span>Markdown Source</span>
            </button>
          </div>

          {activeView === 'timeline' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 8px',
                width: '160px',
              }}
            >
              <Search size={12} color="var(--text-subtle)" style={{ marginRight: '6px' }} />
              <input
                type="text"
                placeholder="Filter time/text..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#fff',
                  fontSize: '11px',
                  width: '100%',
                }}
              />
            </div>
          )}
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
          {activeView === 'timeline' ? (
            filteredTimestamps.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '36px 12px',
                  color: 'var(--text-muted)',
                  fontSize: '12.5px',
                }}
              >
                <Clock size={28} color="var(--text-subtle)" style={{ marginBottom: '8px', opacity: 0.5 }} />
                <p>No timestamps found in this note yet.</p>
                <p style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '4px' }}>
                  Use <strong>Snap</strong> (Alt+S) or <strong>[Time]</strong> (Alt+T) to mark important lecture points.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredTimestamps.map((ts, idx) => {
                  const frameDataUrl = ts.imageFileName ? framesMap.get(ts.imageFileName) : null;

                  return (
                    <div
                      key={ts.id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '10px 12px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Play / Seek Timestamp Button */}
                      <button
                        className="btn btn-primary"
                        onClick={() => onSeek(ts.seconds)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          flexShrink: 0,
                        }}
                        title={`Click to jump active video to ${ts.formattedTime}`}
                      >
                        <Play size={10} fill="currentColor" />
                        <span>{ts.formattedTime}</span>
                      </button>

                      {/* Frame Thumbnail if available */}
                      {frameDataUrl && (
                        <img
                          src={frameDataUrl}
                          alt={ts.imageFileName}
                          style={{
                            width: '56px',
                            height: '34px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            flexShrink: 0,
                          }}
                        />
                      )}

                      {/* Content Description */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#fff',
                            fontWeight: 500,
                            lineHeight: 1.4,
                            wordBreak: 'break-word',
                          }}
                        >
                          {ts.context}
                        </div>
                        {ts.imageFileName && (
                          <div
                            style={{
                              fontSize: '10.5px',
                              color: 'var(--text-subtle)',
                              marginTop: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Image size={10} />
                            <span>Attachment: {ts.imageFileName}</span>
                          </div>
                        )}
                      </div>

                      {/* Row Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        <button
                          className="btn btn-icon"
                          onClick={() => handleCopy(ts.id, `[${ts.formattedTime}]`)}
                          title="Copy timestamp tag"
                          style={{ width: '26px', height: '26px', padding: 0 }}
                        >
                          {copiedId === ts.id ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '11.5px',
                  color: 'var(--text-muted)',
                }}
              >
                <span>Full Markdown Content ({savedMarkdown ? 'Stored on Disk' : 'In Editor'})</span>
                <button
                  className="btn"
                  onClick={() => handleCopy('all-md', savedMarkdown || editorMarkdown)}
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                >
                  {copiedId === 'all-md' ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                  <span>{copiedId === 'all-md' ? 'Copied' : 'Copy All'}</span>
                </button>
              </div>

              <pre
                style={{
                  fontFamily: 'monospace',
                  fontSize: '11.5px',
                  background: 'var(--bg-primary)',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  maxHeight: '360px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: '#e2e8f0',
                }}
              >
                {savedMarkdown || editorMarkdown || '(Note is currently empty)'}
              </pre>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {savedMarkdown && savedMarkdown.trim() && (
              <button
                className="btn"
                onClick={() => {
                  if (confirm('Reload from Obsidian vault? This will replace editor contents with the saved file.')) {
                    onLoadFromVault();
                    onClose();
                  }
                }}
                style={{ fontSize: '11.5px', padding: '4px 10px' }}
                title="Reload the saved file from your Obsidian vault into the editor"
              >
                <RefreshCw size={11} />
                <span>Reload from Vault</span>
              </button>
            )}

            {hasUnsavedChanges && (
              <button
                className="btn btn-emerald"
                onClick={() => {
                  onMergeWithVault();
                  onClose();
                }}
                style={{ fontSize: '11.5px', padding: '4px 10px' }}
                title="Safely merge any new notes/timestamps in the editor into the Obsidian vault file"
              >
                <GitMerge size={11} />
                <span>Merge & Save</span>
              </button>
            )}
          </div>

          <button className="btn" onClick={onClose} style={{ fontSize: '11.5px', padding: '4px 12px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
