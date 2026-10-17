import React, { useState } from 'react';
import { Sparkles, Send, Copy, Check, MessageSquare } from 'lucide-react';
import { askAIAboutVideo } from '../../../utils/geminiClient';
import type { CapturedFrame } from './FrameGallery';

interface AIAssistantProps {
  apiKey: string;
  model?: string;
  pageTitle: string;
  pageUrl: string;
  markdown: string;
  frames: CapturedFrame[];
  onInsertIntoNotes: (text: string) => void;
  onOpenSettings: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({
  apiKey,
  model,
  pageTitle,
  pageUrl,
  markdown,
  frames,
  onInsertIntoNotes,
  onOpenSettings,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachLatestFrame, setAttachLatestFrame] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const latestFrame = frames.length > 0 ? frames[frames.length - 1] : undefined;

  async function handleSend() {
    if (!input.trim() || isLoading) return;

    if (!apiKey.trim()) {
      alert('Please configure your Gemini API Key in Settings first.');
      onOpenSettings();
      return;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'user',
      text: input.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const responseText = await askAIAboutVideo({
        apiKey,
        model,
        userQuestion: userMsg.text,
        pageTitle,
        pageUrl,
        activeFrameDataUrl: attachLatestFrame && latestFrame ? latestFrame.dataUrl : undefined,
        notesContext: markdown.slice(-2000), // pass recent notes context
      });

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        sender: 'assistant',
        text: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        sender: 'assistant',
        text: `Error: ${err instanceof Error ? err.message : 'Failed to reach Gemini AI.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopy(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px' }}>
      {/* Quick Prompt Suggestions */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px' }}>
        {[
          'Summarize key ideas',
          'Explain latest frame',
          'Generate 3 flashcards',
          'Find code bugs shown',
        ].map((suggestion, idx) => (
          <button
            key={idx}
            className="btn"
            style={{ fontSize: '11px', padding: '3px 8px' }}
            onClick={() => setInput(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {/* Messages Feed */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '6px 0',
          minHeight: '260px',
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--text-subtle)',
              fontSize: '12px',
            }}
          >
            <MessageSquare size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
            <p>Ask Gemini questions about the video, architecture, code, or study concepts.</p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
                background:
                  m.sender === 'user'
                    ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-hover))'
                    : 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 10px',
                fontSize: '12.5px',
                lineHeight: '1.5',
              }}
            >
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
              {m.sender === 'assistant' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '6px',
                    paddingTop: '4px',
                    borderTop: '1px solid var(--border-color)',
                  }}
                >
                  <button
                    className="btn"
                    style={{ fontSize: '10px', padding: '2px 6px' }}
                    onClick={() => handleCopy(m.id, m.text)}
                  >
                    {copiedId === m.id ? <Check size={10} /> : <Copy size={10} />}
                    <span>{copiedId === m.id ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: '10px', padding: '2px 6px' }}
                    onClick={() => onInsertIntoNotes(`\n> [!ai] Gemini Answer\n> ${m.text.replace(/\n/g, '\n> ')}\n`)}
                  >
                    Insert to Notes
                  </button>
                  <span style={{ fontSize: '10px', color: 'var(--text-subtle)', marginLeft: 'auto' }}>
                    {m.timestamp}
                  </span>
                </div>
              )}
            </div>
          ))
        )}
        {isLoading && (
          <div style={{ color: 'var(--accent-secondary)', fontSize: '12px', padding: '6px' }}>
            Gemini is analyzing video context...
          </div>
        )}
      </div>

      {/* Frame Attachment Option */}
      {latestFrame && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '11px', color: 'var(--text-subtle)' }}>
          <input
            type="checkbox"
            id="attachFrame"
            checked={attachLatestFrame}
            onChange={(e) => setAttachLatestFrame(e.target.checked)}
          />
          <label htmlFor="attachFrame">
            Attach latest frame ({latestFrame.formattedTime}) for visual OCR context
          </label>
        </div>
      )}

      {/* Chat Input */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          type="text"
          className="input-field"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask AI about video or code..."
          disabled={isLoading}
        />
        <button
          className="btn btn-primary"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          title="Send question"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
};
