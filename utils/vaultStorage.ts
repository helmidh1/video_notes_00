import { get, set } from 'idb-keyval';

const VAULT_HANDLE_KEY = 'obsidian_vault_handle';
const VAULT_NAME_KEY = 'obsidian_vault_name';

export async function selectVaultDirectory(): Promise<FileSystemDirectoryHandle> {
  const windowWithPicker = window as unknown as {
    showDirectoryPicker: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  };
  const handle = await windowWithPicker.showDirectoryPicker({ mode: 'readwrite' });
  await set(VAULT_HANDLE_KEY, handle);
  await set(VAULT_NAME_KEY, handle.name);
  return handle;
}

export async function getSavedVaultDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await get<FileSystemDirectoryHandle>(VAULT_HANDLE_KEY);
  if (!handle) return null;

  try {
    const handleWithPerms = handle as unknown as {
      queryPermission: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
      requestPermission: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    };
    const permission = await handleWithPerms.queryPermission({ mode: 'readwrite' });
    if (permission === 'granted') return handle;

    const requested = await handleWithPerms.requestPermission({ mode: 'readwrite' });
    return requested === 'granted' ? handle : null;
  } catch (err) {
    console.warn('Failed to verify vault directory permission:', err);
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

export async function saveBinaryAttachment(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  dataUrl: string,
  subfolder: string = 'attachments'
): Promise<void> {
  const assetsDir = await dirHandle.getDirectoryHandle(subfolder, { create: true });
  const fileHandle = await assetsDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(dataUrlToUint8Array(dataUrl) as unknown as BufferSource);
  await writable.close();
}

export async function saveMarkdownFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  markdownContent: string
): Promise<void> {
  const safeName = fileName.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'Video-Note';
  const fileHandle = await dirHandle.getFileHandle(`${safeName}.md`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(markdownContent);
  await writable.close();
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
source: "${sourceUrl || ''}"
tags:
${tagsYaml}
---

`;
}
