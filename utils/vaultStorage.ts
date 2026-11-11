import { get, set } from 'idb-keyval';

const VAULT_HANDLE_KEY = 'obsidian_vault_handle';
const VAULT_NAME_KEY = 'obsidian_vault_name';

// In-memory handle cache: prevents permission degradation and deserialization drops in the current session
let cachedVaultHandle: FileSystemDirectoryHandle | null = null;

export function getCachedVaultHandle(): FileSystemDirectoryHandle | null {
  return cachedVaultHandle;
}

export function setCachedVaultHandle(handle: FileSystemDirectoryHandle | null): void {
  cachedVaultHandle = handle;
}

export async function selectVaultDirectory(): Promise<FileSystemDirectoryHandle> {
  const windowWithPicker = window as unknown as {
    showDirectoryPicker: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  };
  const handle = await windowWithPicker.showDirectoryPicker({ mode: 'readwrite' });
  cachedVaultHandle = handle;
  await set(VAULT_HANDLE_KEY, handle);
  await set(VAULT_NAME_KEY, handle.name);
  return handle;
}

export async function reauthorizeVault(): Promise<FileSystemDirectoryHandle | null> {
  // Try to re-request permission on existing handle with user activation
  const handle = cachedVaultHandle || (await get<FileSystemDirectoryHandle>(VAULT_HANDLE_KEY));
  if (handle) {
    try {
      const handleWithPerms = handle as unknown as {
        requestPermission: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
      };
      const requested = await handleWithPerms.requestPermission({ mode: 'readwrite' });
      if (requested === 'granted') {
        cachedVaultHandle = handle;
        return handle;
      }
    } catch {
      // Re-authorization on existing handle was rejected or failed, fall back to picker
    }
  }

  // Open native directory picker as reliable fallback
  return await selectVaultDirectory();
}

export type VaultPermissionState = 'granted' | 'prompt' | 'denied' | 'none';

export async function checkVaultPermissionStatus(): Promise<VaultPermissionState> {
  if (cachedVaultHandle) {
    try {
      const handleWithPerms = cachedVaultHandle as unknown as {
        queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
      };
      if (typeof handleWithPerms.queryPermission === 'function') {
        const permission = await handleWithPerms.queryPermission({ mode: 'readwrite' });
        return permission;
      }
      return 'granted';
    } catch {
      // Fall through to stored handle
    }
  }

  let handle: FileSystemDirectoryHandle | null = null;
  try {
    handle = (await get<FileSystemDirectoryHandle>(VAULT_HANDLE_KEY)) ?? null;
  } catch {
    return 'none';
  }
  if (!handle) return 'none';

  try {
    const handleWithPerms = handle as unknown as {
      queryPermission: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    };
    return await handleWithPerms.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'prompt';
  }
}

export function openNoteInObsidian(vaultName: string, fileName: string): void {
  const cleanName = fileName.replace(/\.md$/, '');
  const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(cleanName)}`;
  if (typeof window !== 'undefined') {
    window.open(uri, '_blank');
  }
}

export function downloadMarkdownFile(fileName: string, content: string): void {
  const safeName =
    fileName.replace(/[\r\n\t]/g, ' ').replace(/[<>:"/\\|?*]+/g, '-').replace(/\.md$/, '').trim() ||
    'Video-Note';
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function getSavedVaultDirectory(interactive = false): Promise<FileSystemDirectoryHandle | null> {
  // 1. First priority: in-memory live handle from showDirectoryPicker
  if (cachedVaultHandle) {
    try {
      const handleWithPerms = cachedVaultHandle as unknown as {
        queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
      };
      if (typeof handleWithPerms.queryPermission === 'function') {
        const permission = await handleWithPerms.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          return cachedVaultHandle;
        }
      } else {
        return cachedVaultHandle;
      }
    } catch {
      // In-memory handle check failed, fall back to stored handle
    }
  }

  // 2. Read serialized handle from IndexedDB
  let handle: FileSystemDirectoryHandle | null = null;
  try {
    handle = (await get<FileSystemDirectoryHandle>(VAULT_HANDLE_KEY)) ?? null;
  } catch {
    return null;
  }
  if (!handle) return null;

  try {
    const handleWithPerms = handle as unknown as {
      queryPermission: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
      requestPermission: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    };

    const permission = await handleWithPerms.queryPermission({ mode: 'readwrite' });
    if (permission === 'granted') {
      cachedVaultHandle = handle;
      return handle;
    }

    // Attempt requestPermission if interactive or active user gesture
    const hasUserActivation =
      interactive ||
      (typeof navigator !== 'undefined' &&
        Boolean((navigator as unknown as { userActivation?: { isActive: boolean } }).userActivation?.isActive));

    if (hasUserActivation) {
      const requested = await handleWithPerms.requestPermission({ mode: 'readwrite' });
      if (requested === 'granted') {
        cachedVaultHandle = handle;
        return handle;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function getSavedVaultName(): Promise<string | null> {
  return (await get<string>(VAULT_NAME_KEY)) || null;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Timeout helper: prevents file writes from hanging forever when Windows / Obsidian locks a file
function withTimeout<T>(promise: Promise<T>, timeoutMs = 7000, errorMsg = 'File operation timed out'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function saveBinaryAttachment(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  dataUrl: string,
  subfolder: string = 'attachments',
  retries = 3
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await withTimeout((async () => {
        const assetsDir = await dirHandle.getDirectoryHandle(subfolder, { create: true });
        const fileHandle = await assetsDir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(dataUrlToUint8Array(dataUrl) as unknown as BufferSource);
        await writable.close();
      })(), 7000, `Writing attachment "${fileName}" timed out`);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

import { mergeMarkdownNotes } from './noteMerge';

export interface ReadFileResult {
  content: string;
  lastModified: number;
}

export async function readMarkdownFileWithMeta(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<ReadFileResult | null> {
  const safeName = fileName.replace(/[\r\n\t]/g, ' ').replace(/[<>:"/\\|?*]+/g, '-').replace(/\.md$/, '').trim() || 'Video-Note';
  try {
    const fileHandle = await dirHandle.getFileHandle(`${safeName}.md`);
    const file = await fileHandle.getFile();
    const content = await file.text();
    return { content, lastModified: file.lastModified };
  } catch {
    return null;
  }
}

export async function readMarkdownFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<string | null> {
  const res = await readMarkdownFileWithMeta(dirHandle, fileName);
  return res ? res.content : null;
}

export async function readBinaryAttachment(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  subfolder: string = 'attachments'
): Promise<string | null> {
  try {
    const assetsDir = await dirHandle.getDirectoryHandle(subfolder);
    const fileHandle = await assetsDir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          resolve('');
        }
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  } catch {
    return null;
  }
}

export interface ExistingNoteResult {
  fileName: string;
  content: string;
  lastModified: number;
}

export async function findExistingNote(
  dirHandle: FileSystemDirectoryHandle,
  title: string,
  pageUrl?: string
): Promise<ExistingNoteResult | null> {
  const safeName = title.replace(/[\r\n\t]/g, ' ').replace(/[<>:"/\\|?*]+/g, '-').trim();

  // 1. Direct match by safe filename
  if (safeName) {
    const directResult = await readMarkdownFileWithMeta(dirHandle, safeName);
    if (directResult) {
      return { fileName: `${safeName}.md`, content: directResult.content, lastModified: directResult.lastModified };
    }
  }

  // 2. Search files in vault root for matching source URL or video ID
  if (pageUrl) {
    try {
      const cleanUrl = pageUrl.split('#')[0].replace(/[?&]t=\d+s?/, '');
      // Extract video ID for YouTube or similar players
      const ytMatch = pageUrl.match(/(?:v=|\/embed\/|\/watch\?v=|youtu\.be\/|\/v\/)([a-zA-Z0-9_-]{11})/);
      const videoId = ytMatch ? ytMatch[1] : null;

      const dirWithEntries = dirHandle as unknown as {
        values: () => AsyncIterable<FileSystemFileHandle | FileSystemDirectoryHandle>;
      };
      if (typeof dirWithEntries.values === 'function') {
        for await (const entry of dirWithEntries.values()) {
          if (entry.kind === 'file' && entry.name.endsWith('.md')) {
            const file = await (entry as FileSystemFileHandle).getFile();
            // Read first 2KB for frontmatter speed
            const slice = file.slice(0, 2048);
            const text = await slice.text();
            if (text.includes(cleanUrl) || (videoId && text.includes(videoId))) {
              const fullText = await file.text();
              return { fileName: entry.name, content: fullText, lastModified: file.lastModified };
            }
          }
        }
      }
    } catch {
      // Fall through if directory iteration isn't permitted
    }
  }

  return null;
}

export interface SaveMarkdownOptions {
  allowOverwrite?: boolean;
  baseContent?: string;
}

export async function saveMarkdownFileNonDestructive(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  markdownContent: string,
  options: SaveMarkdownOptions = {},
  retries = 3
): Promise<{ finalContent: string; wasMerged: boolean; lastModified: number }> {
  const safeName = fileName.replace(/[\r\n\t]/g, ' ').replace(/[<>:"/\\|?*]+/g, '-').replace(/\.md$/, '').trim() || 'Video-Note';
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await withTimeout((async () => {
        let finalContent = markdownContent;
        let wasMerged = false;

        const existingRes = await readMarkdownFileWithMeta(dirHandle, safeName);

        if (existingRes && existingRes.content.trim()) {
          const existingContent = existingRes.content;

          if (options.allowOverwrite) {
            finalContent = markdownContent;
            wasMerged = false;
          } else if (options.baseContent !== undefined) {
            // Optimistic concurrency control:
            // If the content on disk matches what we loaded initially (baseContent),
            // no external modifications occurred in Obsidian. We write user edits directly!
            if (existingContent.trim() === options.baseContent.trim()) {
              finalContent = markdownContent;
              wasMerged = false;
            } else if (existingContent.trim() === markdownContent.trim()) {
              // Disk content already matches what we want to save
              return { finalContent: existingContent, wasMerged: false, lastModified: existingRes.lastModified };
            } else {
              // Disk was modified externally in Obsidian while user was editing in extension!
              // Perform intelligent non-destructive merge so Obsidian edits are never lost
              finalContent = mergeMarkdownNotes(existingContent, markdownContent);
              wasMerged = finalContent.trim() !== markdownContent.trim();
            }
          } else {
            // Fallback when baseContent wasn't provided
            finalContent = mergeMarkdownNotes(existingContent, markdownContent);
            wasMerged = finalContent.trim() !== markdownContent.trim();
          }
        }

        const fileHandle = await dirHandle.getFileHandle(`${safeName}.md`, { create: true });
        const writable = await fileHandle.createWritable({ keepExistingData: false });
        await writable.write(finalContent);
        await writable.close();

        const updatedFile = await fileHandle.getFile();

        return { finalContent, wasMerged, lastModified: updatedFile.lastModified };
      })(), 7000, `Writing note "${safeName}.md" timed out`);
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export async function saveMarkdownFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  markdownContent: string,
  retries = 3
): Promise<void> {
  await saveMarkdownFileNonDestructive(dirHandle, fileName, markdownContent, { allowOverwrite: false }, retries);
}

export function generateObsidianFrontmatter(options: {
  title: string;
  sourceUrl?: string;
  tags?: string[];
}): string {
  const { title, sourceUrl, tags = ['video-notes', 'study'] } = options;
  const isoDate = new Date().toISOString();
  const tagsYaml = tags.map((t) => `  - ${t}`).join('\n');

  return `---
title: "${title.replace(/"/g, '\\"')}"
created: "${isoDate}"
updated: "${isoDate}"
source: "${sourceUrl || ''}"
tags:
${tagsYaml}
---

`;
}

