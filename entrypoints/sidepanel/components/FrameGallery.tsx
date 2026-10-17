import React from 'react';
import { Play, Sparkles, Trash2, ExternalLink } from 'lucide-react';

export interface CapturedFrame {
  id: string;
  fileName: string;
  formattedTime: string;
  timestamp: number;
  dataUrl: string;
  pageTitle: string;
}

interface FrameGalleryProps {
  frames: CapturedFrame[];
  onSeek: (seconds: number) => void;
  onAnalyzeFrame: (frame: CapturedFrame) => void;
  onDeleteFrame: (id: string) => void;
  analyzingFrameId: string | null;
}

export const FrameGallery: React.FC<FrameGalleryProps> = ({
  frames,
  onSeek,
  onAnalyzeFrame,
  onDeleteFrame,
  analyzingFrameId,
}) => {
  if (frames.length === 0) {
    return (
      <div
        style={{
          padding: '24px 16px',
          textAlign: 'center',
          color: 'var(--text-subtle)',
          fontSize: '12px',
        }}
      >
        <p>No video frames captured yet.</p>
        <p style={{ marginTop: '4px' }}>Press <strong>Alt+S</strong> or click <strong>Snap</strong> to capture slides, code, or diagrams.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '10px', padding: '10px' }}>
      {frames.map((frame) => {
        const isAnalyzing = analyzingFrameId === frame.id;
        return (
          <div
            key={frame.id}
            className="glass-panel"
            style={{
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  className="btn"
                  onClick={() => onSeek(frame.timestamp)}
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                  title="Jump video to this moment"
                >
                  <Play size={10} />
                  <span>{frame.formattedTime}</span>
                </button>
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-subtle)',
                    maxWidth: '120px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {frame.fileName}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => onAnalyzeFrame(frame)}
                  disabled={isAnalyzing}
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                  title="Explain code, diagrams, or slides with Gemini"
                >
                  <Sparkles size={11} />
                  <span>{isAnalyzing ? 'Analyzing...' : 'Explain'}</span>
                </button>
                <button
                  className="btn btn-icon"
                  onClick={() => onDeleteFrame(frame.id)}
                  style={{ padding: '3px 6px', color: 'var(--accent-rose)' }}
                  title="Delete frame"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>

            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-sm)' }}>
              <img
                src={frame.dataUrl}
                alt={frame.formattedTime}
                style={{
                  width: '100%',
                  display: 'block',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
