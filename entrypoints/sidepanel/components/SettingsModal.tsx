import React, { useState } from 'react';
import { X, Key, Folder, ExternalLink, Keyboard, Check, BookOpen, Cpu, Radio } from 'lucide-react';
import type { TemplateType } from '../../../utils/templates';

interface SettingsModalProps {
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  vaultName: string | null;
  onConnectVault: () => void;
  selectedTemplate: TemplateType;
  onSelectTemplate: (template: TemplateType) => void;
  onApplyTemplate: () => void;
  autoSaveEnabled: boolean;
  onToggleAutoSave: (enabled: boolean) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  apiKey,
  onApiKeyChange,
  selectedModel,
  onModelChange,
  vaultName,
  onConnectVault,
  selectedTemplate,
  onSelectTemplate,
  onApplyTemplate,
  autoSaveEnabled,
  onToggleAutoSave,
  onClose,
}) => {
  const [localKey, setLocalKey] = useState(apiKey);
  const [savedSuccess, setSavedSuccess] = useState(false);

  function handleSaveKey() {
    onApiKeyChange(localKey);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 50,
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
          maxWidth: '380px',
          background: 'var(--bg-secondary)',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxShadow: 'var(--shadow-md)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>Settings & Vault</h2>
          <button className="btn btn-icon" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        {/* Gemini API Key */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-muted)' }}>
            <Key size={13} color="var(--accent-primary)" />
            <span>Google Gemini API Key</span>
          </label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="password"
              className="input-field"
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              placeholder="AIzaSy..."
            />
            <button className="btn btn-primary" onClick={handleSaveKey}>
              {savedSuccess ? <Check size={13} /> : 'Save'}
            </button>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '4px' }}>
            Stored locally in your browser. Get a free key at{' '}
            <a
              href="https://aistudio.google.com/"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}
            >
              Google AI Studio <ExternalLink size={9} style={{ display: 'inline' }} />
            </a>
          </p>
        </div>

        {/* Gemini Model Selection */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-muted)' }}>
            <Cpu size={13} color="var(--accent-primary)" />
            <span>Gemini Model</span>
          </label>
          <select
            className="input-field"
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            style={{ width: '100%', padding: '6px' }}
          >
            <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended - Fast & Multimodal)</option>
            <option value="gemini-3.8-pro">gemini-3.8-pro (Complex Reasoning & Deep Analysis)</option>
            <option value="gemini-2.0-flash">gemini-2.0-flash (High Speed)</option>
          </select>
          <p style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '4px' }}>
            Uses Google&apos;s latest Gemini models for visual analysis and summaries.
          </p>
        </div>

        {/* Note Template Chooser */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-muted)' }}>
            <BookOpen size={13} color="var(--accent-secondary)" />
            <span>Note Template</span>
          </label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <select
              className="input-field"
              value={selectedTemplate}
              onChange={(e) => onSelectTemplate(e.target.value as TemplateType)}
              style={{ flex: 1, padding: '6px' }}
            >
              <option value="standard">Standard Note</option>
              <option value="cornell">Cornell Note System</option>
              <option value="lecture">Structured Lecture Notes</option>
              <option value="flashcards">Obsidian Flashcards Deck</option>
            </select>
            <button
              className="btn btn-primary"
              onClick={onApplyTemplate}
              style={{ padding: '4px 10px', fontSize: '11px' }}
              title="Apply template to current note"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Local Obsidian Vault */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-muted)' }}>
            <Folder size={13} color="var(--accent-emerald)" />
            <span>Obsidian Vault Connection</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
            <span style={{ fontSize: '12px', color: vaultName ? '#34d399' : 'var(--text-subtle)' }}>
              {vaultName ? `📁 ${vaultName}` : 'No vault linked'}
            </span>
            <button className="btn" onClick={onConnectVault} style={{ padding: '4px 8px', fontSize: '11px' }}>
              {vaultName ? 'Change Vault' : 'Select Vault'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <input
              type="checkbox"
              id="autoSaveToggle"
              checked={autoSaveEnabled}
              onChange={(e) => onToggleAutoSave(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
            />
            <label htmlFor="autoSaveToggle" style={{ fontSize: '11.5px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
              Auto-save to vault every 30s & on pause
            </label>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '4px' }}>
            Uses the HTML5 File System Access API to write .md notes and images directly to disk.
          </p>
        </div>

        {/* Chrome Live Caption Bridge */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-muted)' }}>
            <Radio size={13} color="var(--accent-primary)" />
            <span>Chrome Live Caption Bridge</span>
          </label>
          <div style={{ padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Enable <b>Live Caption</b> in Chrome (<code>chrome://settings/accessibility</code>) and start the local bridge:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <code style={{ flex: 1, padding: '4px 6px', background: '#090d16', borderRadius: '4px', fontSize: '10.5px', color: '#34d399', fontFamily: 'monospace' }}>
                npm run caption-bridge
              </code>
              <button
                className="btn"
                onClick={() => navigator.clipboard.writeText('npm run caption-bridge')}
                style={{ padding: '3px 8px', fontSize: '10px' }}
              >
                Copy
              </button>
            </div>
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-muted)' }}>
            <Keyboard size={13} color="var(--accent-cyan)" />
            <span>Keyboard Shortcuts</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', fontSize: '11px', background: 'var(--bg-primary)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
            <span style={{ fontWeight: 600, color: '#a5b4fc' }}>Alt + S</span>
            <span style={{ color: 'var(--text-muted)' }}>Capture video frame snapshot</span>
            <span style={{ fontWeight: 600, color: '#a5b4fc' }}>Alt + T</span>
            <span style={{ color: 'var(--text-muted)' }}>Insert live timestamp [MM:SS]</span>
            <span style={{ fontWeight: 600, color: '#a5b4fc' }}>Alt + P</span>
            <span style={{ color: 'var(--text-muted)' }}>Toggle video play / pause</span>
          </div>
        </div>

        <button className="btn" onClick={onClose} style={{ alignSelf: 'flex-end', marginTop: '6px' }}>
          Done
        </button>
      </div>
    </div>
  );
};
