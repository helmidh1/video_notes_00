import React from 'react';
import { parseTimeStringToSeconds } from '../../../utils/transcriptExtractor';
import { Play } from 'lucide-react';

interface EditorProps {
  markdown: string;
  onChange: (val: string) => void;
  isPreviewMode: boolean;
  onSeek: (seconds: number) => void;
  framesMap: Map<string, string>; // fileName -> dataUrl
}

export const Editor: React.FC<EditorProps> = ({
  markdown,
  onChange,
  isPreviewMode,
  onSeek,
  framesMap,
}) => {
  if (!isPreviewMode) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px' }}>
        <textarea
          className="input-field"
          value={markdown}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`# Video Study Notes\n\nDrop notes here or use Alt+S to snap frames and Alt+T to insert timestamps.\n\n### [01:23] Overview\n- Key concept explained here...`}
          style={{
            flex: 1,
            minHeight: '380px',
            fontFamily: "'JetBrains Mono', Consolas, 'Fira Code', monospace",
            fontSize: '12.5px',
            lineHeight: '1.6',
            resize: 'none',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px',
          }}
        />
      </div>
    );
  }

  // Render markdown lines in preview mode
  const renderMarkdownPreview = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBuffer: string[] = [];
    let codeLang = '';

    const timestampRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\](?:\([^)]*#t=(\d+)s?\))?/g;
    const wikilinkRegex = /!\[\[(.*?)\]\]/g;

    function formatInline(content: string, keyPrefix: string): React.ReactNode {
      // Replace wikilinks ![[frame.webp]]
      const parts: React.ReactNode[] = [];
      let lastIdx = 0;

      // Handle wikilinks first
      const wikiMatches = Array.from(content.matchAll(wikilinkRegex));
      if (wikiMatches.length > 0) {
        for (const match of wikiMatches) {
          const matchIdx = match.index || 0;
          if (matchIdx > lastIdx) {
            parts.push(content.substring(lastIdx, matchIdx));
          }
          const fileName = match[1];
          const dataUrl = framesMap.get(fileName);
          if (dataUrl) {
            parts.push(
              <div key={`${keyPrefix}-img-${fileName}`} style={{ margin: '8px 0' }}>
                <img
                  src={dataUrl}
                  alt={fileName}
                  style={{
                    maxWidth: '100%',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                  }}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '2px' }}>
                  {fileName}
                </div>
              </div>
            );
          } else {
            parts.push(
              <span key={`${keyPrefix}-missing-${fileName}`} style={{ color: 'var(--accent-amber)' }}>
                ![[{fileName}]]
              </span>
            );
          }
          lastIdx = matchIdx + match[0].length;
        }
        if (lastIdx < content.length) {
          parts.push(content.substring(lastIdx));
        }
        return <>{parts}</>;
      }

      // Handle timestamps [04:21]
      const timeMatches = Array.from(content.matchAll(timestampRegex));
      if (timeMatches.length > 0) {
        let tLast = 0;
        const tParts: React.ReactNode[] = [];
        for (const tm of timeMatches) {
          const tIdx = tm.index || 0;
          if (tIdx > tLast) {
            tParts.push(content.substring(tLast, tIdx));
          }
          const timeLabel = tm[1];
          const urlSeconds = tm[2] ? parseInt(tm[2], 10) : parseTimeStringToSeconds(timeLabel);

          tParts.push(
            <button
              key={`${keyPrefix}-seek-${tIdx}`}
              className="badge"
              onClick={() => onSeek(urlSeconds)}
              style={{
                cursor: 'pointer',
                background: 'rgba(99, 102, 241, 0.2)',
                color: '#a5b4fc',
                borderColor: 'rgba(99, 102, 241, 0.4)',
                margin: '0 2px',
              }}
              title={`Jump video to ${timeLabel}`}
            >
              <Play size={10} style={{ display: 'inline', marginRight: 2 }} />
              {timeLabel}
            </button>
          );
          tLast = tIdx + tm[0].length;
        }
        if (tLast < content.length) {
          tParts.push(content.substring(tLast));
        }
        return <>{tParts}</>;
      }

      return content;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Handle fenced code blocks
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLang = line.replace('```', '').trim();
          codeBuffer = [];
        } else {
          inCodeBlock = false;
          elements.push(
            <pre
              key={`code-${i}`}
              style={{
                background: '#05070c',
                padding: '10px',
                borderRadius: 'var(--radius-sm)',
                overflowX: 'auto',
                fontSize: '12px',
                fontFamily: 'monospace',
                border: '1px solid var(--border-color)',
                margin: '8px 0',
              }}
            >
              <code>{codeBuffer.join('\n')}</code>
            </pre>
          );
        }
        continue;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        continue;
      }

      // Obsidian callout
      if (line.startsWith('> [!')) {
        const calloutMatch = line.match(/^>\s*\[!(\w+)\]\s*(.*)$/);
        const calloutType = calloutMatch ? calloutMatch[1] : 'info';
        const calloutTitle = calloutMatch ? calloutMatch[2] : calloutType.toUpperCase();
        elements.push(
          <div key={`callout-${i}`} className="callout">
            <div className="callout-title">{calloutTitle || calloutType.toUpperCase()}</div>
          </div>
        );
        continue;
      }

      if (line.startsWith('> ')) {
        elements.push(
          <div
            key={`quote-${i}`}
            style={{
              paddingLeft: '10px',
              borderLeft: '2px solid var(--text-subtle)',
              color: 'var(--text-muted)',
              margin: '4px 0',
            }}
          >
            {formatInline(line.substring(2), `quote-${i}`)}
          </div>
        );
        continue;
      }

      // Headings
      if (line.startsWith('# ')) {
        elements.push(
          <h1 key={`h1-${i}`} style={{ fontSize: '18px', margin: '14px 0 6px', color: '#fff' }}>
            {formatInline(line.substring(2), `h1-${i}`)}
          </h1>
        );
        continue;
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h2
            key={`h2-${i}`}
            style={{ fontSize: '15px', margin: '12px 0 6px', color: 'var(--accent-cyan)' }}
          >
            {formatInline(line.substring(3), `h2-${i}`)}
          </h2>
        );
        continue;
      }
      if (line.startsWith('### ')) {
        elements.push(
          <h3
            key={`h3-${i}`}
            style={{ fontSize: '13px', margin: '10px 0 4px', color: 'var(--accent-primary)' }}
          >
            {formatInline(line.substring(4), `h3-${i}`)}
          </h3>
        );
        continue;
      }

      // Unordered lists
      if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <div key={`li-${i}`} style={{ display: 'flex', gap: '6px', margin: '3px 0 3px 12px' }}>
            <span style={{ color: 'var(--accent-primary)' }}>•</span>
            <div>{formatInline(line.substring(2), `li-${i}`)}</div>
          </div>
        );
        continue;
      }

      // Horizontal rule
      if (line.trim() === '---') {
        elements.push(
          <hr
            key={`hr-${i}`}
            style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '12px 0' }}
          />
        );
        continue;
      }

      // Empty line
      if (!line.trim()) {
        elements.push(<div key={`empty-${i}`} style={{ height: '8px' }} />);
        continue;
      }

      // Regular paragraph
      elements.push(
        <p key={`p-${i}`} style={{ margin: '4px 0' }}>
          {formatInline(line, `p-${i}`)}
        </p>
      );
    }

    return elements;
  };

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 14px',
        lineHeight: '1.6',
        fontSize: '13px',
      }}
    >
      {renderMarkdownPreview(markdown)}
    </div>
  );
};
