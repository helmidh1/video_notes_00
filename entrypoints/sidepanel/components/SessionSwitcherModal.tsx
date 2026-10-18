import React from 'react';
import type { VideoSession } from '../../../utils/sessionManager';
import {
  Layers,
  Check,
  ExternalLink,
  Trash2,
  Volume2,
  FileText,
  Image,
  Clock,
  Radio,
  X,
  Play,
} from 'lucide-react';

interface SessionSwitcherModalProps {
  sessions: VideoSession[];
  currentSessionKey: string;
  audibleSessionKey?: string | null;
  onSelectSession: (sessionKey: string) => void;
  onDeleteSession: (sessionKey: string) => void;
  onClose: () => void;
}

export const SessionSwitcherModal: React.FC<SessionSwitcherModalProps> = ({
  sessions,
  currentSessionKey,
  audibleSessionKey,
  onSelectSession,
  onDeleteSession,
  onClose,
}) => {
  return (
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
          maxWidth: '440px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg, 12px)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-tertiary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={16} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '13.5px', fontWeight: 600, color: '#fff', margin: 0 }}>
              Video Note Sessions ({sessions.length})
            </h3>
          </div>
          <button className="btn btn-icon" onClick={onClose} title="Close session manager">
            <X size={15} />
          </button>
        </div>

        {/* Info banner */}
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(99, 102, 241, 0.08)',
            borderBottom: '1px solid var(--border-color)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            lineHeight: 1.4,
          }}
        >
          Each video tab maintains an independent note in your Obsidian vault. Transcripts,
          timestamps, and captured frames are strictly isolated per URL and never mixed.
        </div>

        {/* Sessions list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {sessions.length === 0 ? (
            <div
              style={{
                padding: '30px 16px',
                textAlign: 'center',
                color: 'var(--text-subtle)',
                fontSize: '12px',
              }}
            >
              No video sessions recorded yet. Open any video tab to automatically initialize a session.
            </div>
          ) : (
            sessions.map((s) => {
              const isActive = s.sessionKey === currentSessionKey;
              const isAudible = s.sessionKey === audibleSessionKey;

              return (
                <div
                  key={s.sessionKey}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md, 8px)',
                    background: isActive ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-primary)',
                    border: isActive ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Title & Badges */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontWeight: 600,
                          fontSize: '12.5px',
                          color: '#fff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          margin: 0,
                        }}
                        title={s.title}
                      >
                        {s.title || 'Untitled Video'}
                      </p>
                      <p
                        style={{
                          fontSize: '10.5px',
                          color: 'var(--text-subtle)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginTop: '2px',
                        }}
                      >
                        {s.canonicalUrl || s.rawUrl}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      {isActive && (
                        <span
                          className="badge"
                          style={{
                            background: 'rgba(99, 102, 241, 0.2)',
                            color: '#a5b4fc',
                            borderColor: 'var(--accent-primary)',
                            fontSize: '10px',
                            padding: '2px 6px',
                          }}
                        >
                          <Check size={10} /> Active
                        </span>
                      )}
                      {isAudible && (
                        <span
                          className="badge"
                          style={{
                            background: 'rgba(16, 185, 129, 0.2)',
                            color: '#34d399',
                            borderColor: '#10b981',
                            fontSize: '10px',
                            padding: '2px 6px',
                          }}
                          title="This tab is actively playing audio"
                        >
                          <Volume2 size={10} /> Playing
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metrics Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={11} color="var(--accent-primary)" />
                      {s.formattedTime || '00:00'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Image size={11} />
                      {s.frames?.length || 0} frames
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Radio size={11} />
                      {s.captionItems?.length || 0} captions
                    </span>
                    {s.targetFileName && (
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginLeft: 'auto',
                          color: 'var(--text-subtle)',
                          fontFamily: 'monospace',
                          fontSize: '10px',
                        }}
                        title={`Obsidian File: ${s.targetFileName}`}
                      >
                        <FileText size={10} /> {s.targetFileName}
                      </span>
                    )}
                  </div>

                  {/* Actions Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: '4px',
                      paddingTop: '6px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    {!isActive ? (
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          onSelectSession(s.sessionKey);
                          onClose();
                        }}
                        style={{ fontSize: '11px', padding: '3px 10px', height: '24px' }}
                      >
                        Switch to Note
                      </button>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--accent-emerald)' }}>
                        Currently Editing in Side Panel
                      </span>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {s.rawUrl && (
                        <button
                          className="btn btn-icon"
                          onClick={() => {
                            chrome.tabs.create({ url: s.rawUrl });
                          }}
                          title="Open video URL in new tab"
                          style={{ padding: '3px 5px' }}
                        >
                          <ExternalLink size={12} />
                        </button>
                      )}

                      {!isActive && (
                        <button
                          className="btn btn-icon"
                          onClick={() => onDeleteSession(s.sessionKey)}
                          title="Remove session from extension history (does not delete Obsidian file)"
                          style={{ padding: '3px 5px', color: '#f87171' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button className="btn" onClick={onClose} style={{ fontSize: '11px', padding: '4px 12px' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
