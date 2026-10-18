import type { CapturedFrame } from '../entrypoints/sidepanel/components/FrameGallery';
import type { LiveCaptionItem } from './messaging';

export interface ManualSession {
  id: string; // Unique UUID
  name: string; // Display name, e.g. "Linear Algebra - Lecture 1"
  createdAt: number;
  updatedAt: number;

  // Associated Tab / Webpage
  linkedTabId?: number; // Chrome Tab ID associated with this session
  linkedUrl: string; // URL of the video/page
  linkedTitle: string; // Page/video title when linked

  // Linked Obsidian Target
  obsidianFileName: string; // Target filename without .md (e.g. "Linear Algebra 101")
  obsidianFolderPath: string; // Target subfolder (e.g. "Courses/Math" or "" for vault root)

  // Session Content & Media
  markdown: string;
  frames: CapturedFrame[];
  captionItems: LiveCaptionItem[];
  lastVideoTime?: { seconds: number; formattedTime: string };

  // Sync Metadata
  lastSavedMarkdown?: string;
  lastSavedTime?: number;
  lastDiskModified?: number;
}

const STORAGE_SESSIONS_KEY = 'manual_sessions_v1';
const STORAGE_ACTIVE_ID_KEY = 'active_manual_session_id_v1';

export function sanitizeFileName(name: string): string {
  if (!name) return 'Video-Note';
  const cleaned = name
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\.md$/i, '')
    .trim();
  return cleaned || 'Video-Note';
}

export function sanitizeFolderPath(path: string): string {
  if (!path) return '';
  return path
    .replace(/\\/g, '/')
    .split('/')
    .map((seg) => seg.replace(/[<>:"|?*]+/g, '-').trim())
    .filter((seg) => seg.length > 0 && seg !== '.')
    .join('/');
}

export async function getAllManualSessions(): Promise<ManualSession[]> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return [];
  }
  const result = await chrome.storage.local.get([STORAGE_SESSIONS_KEY]);
  const sessions = result[STORAGE_SESSIONS_KEY];
  return Array.isArray(sessions) ? sessions : [];
}

export async function getActiveManualSessionId(): Promise<string | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }
  const result = await chrome.storage.local.get([STORAGE_ACTIVE_ID_KEY]);
  return result[STORAGE_ACTIVE_ID_KEY] || null;
}

export async function setActiveManualSessionId(id: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }
  await chrome.storage.local.set({ [STORAGE_ACTIVE_ID_KEY]: id });
}

export async function saveManualSession(session: ManualSession): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }
  const sessions = await getAllManualSessions();
  const index = sessions.findIndex((s) => s.id === session.id);
  const updatedSession = { ...session, updatedAt: Date.now() };

  if (index >= 0) {
    sessions[index] = updatedSession;
  } else {
    sessions.push(updatedSession);
  }

  await chrome.storage.local.set({ [STORAGE_SESSIONS_KEY]: sessions });
}

export async function createManualSession(params: {
  name?: string;
  linkedTabId?: number;
  linkedUrl?: string;
  linkedTitle?: string;
  obsidianFileName?: string;
  obsidianFolderPath?: string;
  markdown?: string;
}): Promise<ManualSession> {
  const id = crypto.randomUUID ? crypto.randomUUID() : 'session_' + Date.now();
  const now = Date.now();
  const title = params.name || params.linkedTitle || 'Video Study Notes';
  const safeName = sanitizeFileName(params.obsidianFileName || title);
  const safeFolder = sanitizeFolderPath(params.obsidianFolderPath || '');

  const newSession: ManualSession = {
    id,
    name: title,
    createdAt: now,
    updatedAt: now,
    linkedTabId: params.linkedTabId,
    linkedUrl: params.linkedUrl || '',
    linkedTitle: params.linkedTitle || title,
    obsidianFileName: safeName,
    obsidianFolderPath: safeFolder,
    markdown: params.markdown || '',
    frames: [],
    captionItems: [],
  };

  await saveManualSession(newSession);
  await setActiveManualSessionId(id);
  return newSession;
}

export async function deleteManualSession(id: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }
  const sessions = await getAllManualSessions();
  const filtered = sessions.filter((s) => s.id !== id);
  await chrome.storage.local.set({ [STORAGE_SESSIONS_KEY]: filtered });

  const activeId = await getActiveManualSessionId();
  if (activeId === id) {
    const nextActive = filtered.length > 0 ? filtered[0].id : null;
    if (nextActive) {
      await setActiveManualSessionId(nextActive);
    } else {
      await chrome.storage.local.remove([STORAGE_ACTIVE_ID_KEY]);
    }
  }
}

export async function getOrCreateCurrentManualSession(activeTabInfo?: {
  id?: number;
  url?: string;
  title?: string;
}): Promise<{ session: ManualSession; isNew: boolean }> {
  const sessions = await getAllManualSessions();
  const activeId = await getActiveManualSessionId();

  if (activeId) {
    const found = sessions.find((s) => s.id === activeId);
    if (found) {
      return { session: found, isNew: false };
    }
  }

  // If sessions exist but no activeId, use first session
  if (sessions.length > 0) {
    await setActiveManualSessionId(sessions[0].id);
    return { session: sessions[0], isNew: false };
  }

  // No sessions exist yet: initialize initial session pre-filled from active tab
  const initialSession = await createManualSession({
    name: activeTabInfo?.title || 'Video Study Notes',
    linkedTabId: activeTabInfo?.id,
    linkedUrl: activeTabInfo?.url || '',
    linkedTitle: activeTabInfo?.title || 'Video Study Notes',
    obsidianFileName: sanitizeFileName(activeTabInfo?.title || 'Video Study Notes'),
    obsidianFolderPath: '',
  });

  return { session: initialSession, isNew: true };
}
