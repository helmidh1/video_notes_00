import React, { useState } from 'react';
import {
  Folder,
  FileText,
  Globe,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Link,
  Layers,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import type { ManualSession } from '../../../utils/sessionManager';

interface SessionManagerModalProps {
  sessions: ManualSession[];
  activeSessionId: string | null;
  currentTabInfo?: { id?: number; url?: string; title?: string };
  onSelectSession: (id: string) => void;
  onCreateSession: (params: {
    name: string;
    obsidianFileName: string;
    obsidianFolderPath: string;
    linkToCurrentTab: boolean;
  }) => Promise<void>;
  onUpdateSession: (
    id: string,
    updates: Partial<{
      name: string;
      obsidianFileName: string;
      obsidianFolderPath: string;
      linkedTabId?: number;
      linkedUrl?: string;
      linkedTitle?: string;
    }>
  ) => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  onClose: () => void;
}

export const SessionManagerModal: React.FC<SessionManagerModalProps> = ({
  sessions,
  activeSessionId,
  currentTabInfo,
  onSelectSession,
  onCreateSession,
  onUpdateSession,
  onDeleteSession,
  onClose,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // New session state
  const [newName, setNewName] = useState(currentTabInfo?.title || 'New Study Session');
  const [newFile, setNewFile] = useState(currentTabInfo?.title || 'New Study Session');
  const [newFolder, setNewFolder] = useState('');
  const [newLinkTab, setNewLinkTab] = useState(true);

  // Edit session state
  const [editName, setEditName] = useState('');
  const [editFile, setEditFile] = useState('');
  const [editFolder, setEditFolder] = useState('');

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const isLinkedToActiveTab =
    Boolean(activeSession?.linkedTabId && currentTabInfo?.id && activeSession.linkedTabId === currentTabInfo.id) ||
    Boolean(activeSession?.linkedUrl && currentTabInfo?.url && activeSession.linkedUrl.split('#')[0] === currentTabInfo.url.split('#')[0]);

  function handleStartCreate() {
    setNewName(currentTabInfo?.title || 'New Study Session');
    setNewFile(currentTabInfo?.title || 'New Study Session');
    setNewFolder('');
    setNewLinkTab(true);
    setIsCreating(true);
    setEditingId(null);
  }

  function handleStartEdit(session: ManualSession) {
    setEditingId(session.id);
    setEditName(session.name);
    setEditFile(session.obsidianFileName);
    setEditFolder(session.obsidianFolderPath || '');
    setIsCreating(false);
  }

  async function handleSaveEdit(id: string) {
    await onUpdateSession(id, {
      name: editName.trim() || 'Untitled Session',
      obsidianFileName: editFile.trim() || 'Video-Note',
      obsidianFolderPath: editFolder.trim(),
    });
    setEditingId(null);
  }

  async function handleRelinkToCurrentTab(sessionId: string) {
    if (!currentTabInfo) return;
    await onUpdateSession(sessionId, {
      linkedTabId: currentTabInfo.id,
      linkedUrl: currentTabInfo.url || '',
      linkedTitle: currentTabInfo.title || 'Video Tab',
    });
  }

  async function handleSubmitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await onCreateSession({
      name: newName.trim(),
      obsidianFileName: newFile.trim() || newName.trim(),
      obsidianFolderPath: newFolder.trim(),
      linkToCurrentTab: newLinkTab,
    });
    setIsCreating(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container"
        style={{ maxWidth: '440px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={17} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Manage Sessions</h3>
          </div>
          <button className="btn btn-icon" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '14px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Active Tab Notice & Re-link banner */}
          {activeSession && (
            <div
              style={{
                padding: '10px 12px',
                background: isLinkedToActiveTab ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                border: `1px solid ${isLinkedToActiveTab ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                borderRadius: 'var(--radius-sm)',
                fontSize: '11.5px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, color: isLinkedToActiveTab ? '#34d399' : '#fbbf24' }}>
                  {isLinkedToActiveTab ? '✓ Active Session Linked to Current Tab' : '⚠️ Tab Mismatch'}
                </span>
                {!isLinkedToActiveTab && currentTabInfo?.id && (
                  <button
                    className="btn btn-primary"
                    style={{ padding: '3px 8px', fontSize: '10.5px' }}
                    onClick={() => handleRelinkToCurrentTab(activeSession.id)}
                  >
                    <Link size={11} style={{ marginRight: '4px' }} />
                    Link to Current Tab
                  </button>
                )}
              </div>
              <p style={{ color: 'var(--text-subtle)', lineHeight: 1.4 }}>
                Active session <strong>"{activeSession.name}"</strong> only ingests captions and notes from its associated tab.
              </p>
            </div>
          )}

          {/* Action: New Session Button */}
          {!isCreating && (
            <button
              className="btn btn-primary"
              onClick={handleStartCreate}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px' }}
            >
              <Plus size={14} />
              <span>Create New Session</span>
            </button>
          )}

          {/* Create Session Form */}
          {isCreating && (
            <form
              onSubmit={handleSubmitCreate}
              className="glass-panel"
              style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)' }}>New Session</span>
                <button type="button" className="btn btn-icon" onClick={() => setIsCreating(false)}>
                  <X size={14} />
                </button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '3px' }}>
                  Session Display Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (!newFile || newFile === newName) {
                      setNewFile(e.target.value);
                    }
                  }}
                  placeholder="e.g. CS50 - Lecture 1"
                  required
                  style={{ width: '100%', fontSize: '12px', padding: '6px 8px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '3px' }}>
                  Obsidian Note Filename (.md)
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={newFile}
                  onChange={(e) => setNewFile(e.target.value)}
                  placeholder="e.g. CS50 Lecture 1"
                  required
                  style={{ width: '100%', fontSize: '12px', padding: '6px 8px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '3px' }}>
                  Obsidian Vault Subfolder (Optional)
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  placeholder="e.g. Courses/CS50 (leave blank for vault root)"
                  style={{ width: '100%', fontSize: '12px', padding: '6px 8px' }}
                />
                <span style={{ fontSize: '10px', color: 'var(--text-subtle)', marginTop: '2px', display: 'block' }}>
                  Attachments will be saved in <code>{newFolder ? `${newFolder}/attachments/` : 'attachments/'}</code>
                </span>
              </div>

              {currentTabInfo?.title && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newLinkTab}
                    onChange={(e) => setNewLinkTab(e.target.checked)}
                  />
                  <span>Link to currently active tab (<strong>{currentTabInfo.title.slice(0, 32)}...</strong>)</span>
                </label>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button type="button" className="btn" onClick={() => setIsCreating(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create & Switch
                </button>
              </div>
            </form>
          )}

          {/* List of Sessions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              All Sessions ({sessions.length})
            </span>

            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const isEditing = editingId === session.id;

              if (isEditing) {
                return (
                  <div
                    key={session.id}
                    className="glass-panel"
                    style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}
                  >
                    <div>
                      <label style={{ fontSize: '10.5px', color: 'var(--text-subtle)' }}>Session Name</label>
                      <input
                        type="text"
                        className="input-field"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ width: '100%', fontSize: '12px', padding: '5px 7px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10.5px', color: 'var(--text-subtle)' }}>Obsidian Note Name</label>
                      <input
                        type="text"
                        className="input-field"
                        value={editFile}
                        onChange={(e) => setEditFile(e.target.value)}
                        style={{ width: '100%', fontSize: '12px', padding: '5px 7px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10.5px', color: 'var(--text-subtle)' }}>Obsidian Subfolder</label>
                      <input
                        type="text"
                        className="input-field"
                        value={editFolder}
                        onChange={(e) => setEditFolder(e.target.value)}
                        placeholder="Leave blank for vault root"
                        style={{ width: '100%', fontSize: '12px', padding: '5px 7px' }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '2px' }}>
                      <button className="btn" onClick={() => setEditingId(null)} style={{ padding: '4px 8px' }}>
                        Cancel
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleSaveEdit(session.id)}
                        style={{ padding: '4px 8px' }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={session.id}
                  className="glass-panel"
                  style={{
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-color)',
                    background: isActive ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-secondary)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: isActive ? '#fff' : 'var(--text-primary)' }}>
                        {session.name}
                      </span>
                      {isActive && (
                        <span className="badge badge-connected" style={{ fontSize: '10px', padding: '1px 6px' }}>
                          Active
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        className="btn btn-icon"
                        title="Edit session details"
                        onClick={() => handleStartEdit(session)}
                        style={{ padding: '4px' }}
                      >
                        <Edit2 size={12} />
                      </button>
                      {sessions.length > 1 && (
                        <button
                          className="btn btn-icon"
                          title="Delete session"
                          onClick={() => {
                            if (window.confirm(`Delete session "${session.name}"? Note files in Obsidian will remain intact.`)) {
                              onDeleteSession(session.id);
                            }
                          }}
                          style={{ padding: '4px', color: '#fb7185' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Obsidian destination path */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-subtle)' }}>
                    <Folder size={11} color="#a5b4fc" />
                    <span>
                      {session.obsidianFolderPath ? `${session.obsidianFolderPath}/` : ''}
                      <strong>{session.obsidianFileName}.md</strong>
                    </span>
                  </div>

                  {/* Associated Webpage / Tab */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-subtle)' }}>
                    <Globe size={11} color="#34d399" />
                    <span
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '280px',
                      }}
                      title={session.linkedTitle || session.linkedUrl}
                    >
                      {session.linkedTitle || session.linkedUrl || 'Unlinked (generic)'}
                    </span>
                  </div>

                  {/* Stats & Switch Action */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                      {session.frames?.length || 0} frames • {session.captionItems?.length || 0} captions
                    </span>

                    {!isActive ? (
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          onSelectSession(session.id);
                          onClose();
                        }}
                        style={{ padding: '3px 10px', fontSize: '11px' }}
                      >
                        Switch to Session
                      </button>
                    ) : (
                      <span style={{ fontSize: '10.5px', color: 'var(--accent-primary)', fontWeight: 500 }}>
                        Current Session
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '10px 14px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
