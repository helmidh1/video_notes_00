import type { LiveCaptionItem } from './messaging';
import type { CapturedFrame } from '../entrypoints/sidepanel/components/FrameGallery';

export interface VideoSession {
  sessionKey: string;
  canonicalUrl: string;
  rawUrl: string;
  tabId?: number;
  title: string;
  targetFileName: string;
  markdown: string;
  frames: CapturedFrame[];
  captionItems: LiveCaptionItem[];
  playheadTime: number;
  formattedTime: string;
  isAudible: boolean;
  isPlaying: boolean;
  autoAppend: boolean;
  lastSavedMarkdown: string;
  lastSavedTime: number;
  existingVaultMarkdown?: string;
  existingVaultFileName?: string;
}

/**
 * Sanitizes a title string into a safe Obsidian markdown filename.
 */
export function sanitizeFileName(title: string): string {
  const safe = (title || 'Video-Notes')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.md$/, '')
    .trim();
  return safe || 'Video-Notes';
}

/**
 * Normalizes any video or web URL into a canonical URL and unique sessionKey.
 * Guarantees that timestamp links, tracking parameters, and hash fragments
 * do not create duplicate or fragmented sessions for the exact same video.
 */
export function normalizeSessionUrl(rawUrl: string): { canonicalUrl: string; sessionKey: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { canonicalUrl: '', sessionKey: 'session_unknown' };
  }

  const trimmed = rawUrl.trim();

  // 1. YouTube normalization
  const ytMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    return {
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      sessionKey: `yt_${videoId}`,
    };
  }

  // 2. Vimeo normalization
  const vimeoMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/[^\/]*\/videos\/|video\/|)(\d+)/
  );
  if (vimeoMatch && vimeoMatch[1]) {
    const vimeoId = vimeoMatch[1];
    return {
      canonicalUrl: `https://vimeo.com/${vimeoId}`,
      sessionKey: `vimeo_${vimeoId}`,
    };
  }

  // 3. Local file normalization (file:///)
  if (trimmed.startsWith('file:///')) {
    const pathPart = trimmed.replace(/[?#].*$/, '');
    const cleanKey = 'file_' + pathPart.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-60);
    return {
      canonicalUrl: pathPart,
      sessionKey: cleanKey,
    };
  }

  // 4. Standard web URLs (Coursera, Canvas LMS, Udemy, etc.)
  try {
    const parsed = new URL(trimmed);
    // Strip timestamps, tracking query params, and fragments
    parsed.hash = '';
    const dropParams = ['t', 'time_continue', 'si', 'feature', 'embeds_referring_euri', 'source_ve_path', 'utm_source', 'utm_medium', 'utm_campaign'];
    for (const p of dropParams) {
      parsed.searchParams.delete(p);
    }
    const cleanUrl = parsed.toString().replace(/\/$/, '');
    // Generate safe alphanumeric key from host + path
    const keySlug = (parsed.hostname + parsed.pathname)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 80);
    return {
      canonicalUrl: cleanUrl,
      sessionKey: `web_${keySlug}`,
    };
  } catch {
    // Fallback for non-standard or malformed URLs
    const clean = trimmed.split('#')[0].replace(/[?&]t=\d+s?/, '');
    const safeSlug = clean.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    return {
      canonicalUrl: clean,
      sessionKey: `misc_${safeSlug}`,
    };
  }
}

export function getSessionStorageKey(sessionKey: string): string {
  return `vn_session_${sessionKey}`;
}

export function createDefaultSession(
  rawUrl: string,
  title?: string,
  tabId?: number
): VideoSession {
  const { canonicalUrl, sessionKey } = normalizeSessionUrl(rawUrl);
  const cleanTitle = (title || 'Video Notes').replace(/ - YouTube$/, '').trim();
  const targetFileName = `${sanitizeFileName(cleanTitle)}.md`;

  return {
    sessionKey,
    canonicalUrl,
    rawUrl,
    tabId,
    title: cleanTitle,
    targetFileName,
    markdown: '',
    frames: [],
    captionItems: [],
    playheadTime: 0,
    formattedTime: '00:00',
    isAudible: false,
    isPlaying: false,
    autoAppend: false,
    lastSavedMarkdown: '',
    lastSavedTime: 0,
  };
}

/**
 * Loads a persisted session from chrome.storage.local
 */
export async function loadSession(sessionKey: string): Promise<VideoSession | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }
  const storageKey = getSessionStorageKey(sessionKey);
  try {
    const stored = await chrome.storage.local.get([storageKey]);
    if (stored && stored[storageKey]) {
      return stored[storageKey] as VideoSession;
    }
  } catch {
    // Ignore storage retrieval failure
  }
  return null;
}

/**
 * Saves a session to chrome.storage.local and updates the global session registry
 */
export async function saveSession(session: VideoSession): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }
  const storageKey = getSessionStorageKey(session.sessionKey);
  try {
    // 1. Store session payload
    await chrome.storage.local.set({ [storageKey]: session });

    // 2. Add to active session registry list
    const regRes = await chrome.storage.local.get(['vn_session_index']);
    const index: string[] = Array.isArray(regRes?.vn_session_index) ? regRes.vn_session_index : [];
    if (!index.includes(session.sessionKey)) {
      index.push(session.sessionKey);
      await chrome.storage.local.set({ vn_session_index: index });
    }
  } catch (err) {
    console.warn('Failed to save session to chrome.storage.local:', err);
  }
}

/**
 * Retrieves all registered video sessions
 */
export async function getAllSessions(): Promise<VideoSession[]> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return [];
  }
  try {
    const regRes = await chrome.storage.local.get(['vn_session_index']);
    const index: string[] = Array.isArray(regRes?.vn_session_index) ? regRes.vn_session_index : [];
    if (index.length === 0) return [];

    const keys = index.map(getSessionStorageKey);
    const stored = await chrome.storage.local.get(keys);
    const sessions: VideoSession[] = [];
    for (const k of keys) {
      if (stored[k]) {
        sessions.push(stored[k] as VideoSession);
      }
    }
    return sessions;
  } catch {
    return [];
  }
}

/**
 * Deletes a session from chrome.storage.local
 */
export async function deleteSession(sessionKey: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }
  const storageKey = getSessionStorageKey(sessionKey);
  try {
    await chrome.storage.local.remove([storageKey]);
    const regRes = await chrome.storage.local.get(['vn_session_index']);
    let index: string[] = Array.isArray(regRes?.vn_session_index) ? regRes.vn_session_index : [];
    index = index.filter((k) => k !== sessionKey);
    await chrome.storage.local.set({ vn_session_index: index });
  } catch {
    // Ignore error
  }
}
