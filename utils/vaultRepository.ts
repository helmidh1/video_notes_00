import type { CapturedFrame } from '../entrypoints/sidepanel/components/FrameGallery';
import { generateObsidianFrontmatter, getSavedVaultDirectory } from './vaultStorage';
import { extractFrontmatter, parseFramesFromMarkdown, mergeMarkdownNotes } from './noteMerge';
import { formatSeconds } from './transcriptExtractor';

export function uint8ArrayToDataUrl(bytes: Uint8Array, mimeType = 'image/webp'): string {
  if (typeof btoa === 'function') {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
  }
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return `data:${mimeType};base64,${buf.toString('base64')}`;
}

export interface NoteDocument {
  title: string;
  markdown: string;
  frames: CapturedFrame[];
  pageUrl: string;
  existingFileName?: string;
  baseContent?: string;
  lastModified?: number;
}

export type SaveStatus = 'saved' | 'merged' | 'conflict_flagged';
export type SaveDestination = 'vault_disk' | 'session_mirror';

export interface SaveResult {
  status: SaveStatus;
  destination: SaveDestination;
  fileName: string;
  content: string;
  savedAttachmentCount: number;
}

export interface FileSystemAdapter {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  readBinary(path: string): Promise<Uint8Array>;
  writeBinary(path: string, data: Uint8Array): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  listFiles(dir?: string): Promise<string[]>;
}

export class InMemoryFileSystemAdapter implements FileSystemAdapter {
  private textFiles = new Map<string, string>();
  private binaryFiles = new Map<string, Uint8Array>();

  async readText(path: string): Promise<string> {
    const content = this.textFiles.get(path);
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  async writeText(path: string, text: string): Promise<void> {
    this.textFiles.set(path, text);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const data = this.binaryFiles.get(path);
    if (data === undefined) {
      throw new Error(`Binary file not found: ${path}`);
    }
    return data;
  }

  async writeBinary(path: string, data: Uint8Array): Promise<void> {
    this.binaryFiles.set(path, data);
  }

  async fileExists(path: string): Promise<boolean> {
    return this.textFiles.has(path) || this.binaryFiles.has(path);
  }

  async listFiles(dir?: string): Promise<string[]> {
    const all = Array.from(new Set([...this.textFiles.keys(), ...this.binaryFiles.keys()]));
    if (!dir) return all;
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    return all.filter((k) => k.startsWith(prefix));
  }
}

export class ChromeFileSystemAdapter implements FileSystemAdapter {
  constructor(private getDirHandle: () => Promise<FileSystemDirectoryHandle | null>) {}

  private async getHandle(): Promise<FileSystemDirectoryHandle> {
    const handle = await this.getDirHandle();
    if (!handle) {
      throw new Error('Vault directory not connected');
    }
    return handle;
  }

  async readText(path: string): Promise<string> {
    const handle = await this.getHandle();
    const parts = path.split('/');
    if (parts.length > 1) {
      const dir = await handle.getDirectoryHandle(parts[0], { create: false });
      const file = await dir.getFileHandle(parts[1], { create: false });
      const f = await file.getFile();
      return await f.text();
    }
    const file = await handle.getFileHandle(path, { create: false });
    const f = await file.getFile();
    return await f.text();
  }

  async writeText(path: string, text: string): Promise<void> {
    const handle = await this.getHandle();
    const parts = path.split('/');
    let targetDir = handle;
    let targetFileName = path;
    if (parts.length > 1) {
      targetDir = await handle.getDirectoryHandle(parts[0], { create: true });
      targetFileName = parts[1];
    }
    const file = await targetDir.getFileHandle(targetFileName, { create: true });
    const writable = await file.createWritable();
    await writable.write(text);
    await writable.close();
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const handle = await this.getHandle();
    const parts = path.split('/');
    let fileHandle: FileSystemFileHandle;
    if (parts.length > 1) {
      const dir = await handle.getDirectoryHandle(parts[0], { create: false });
      fileHandle = await dir.getFileHandle(parts[1], { create: false });
    } else {
      fileHandle = await handle.getFileHandle(path, { create: false });
    }
    const f = await fileHandle.getFile();
    const buffer = await f.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async writeBinary(path: string, data: Uint8Array): Promise<void> {
    const handle = await this.getHandle();
    const parts = path.split('/');
    let targetDir = handle;
    let targetFileName = path;
    if (parts.length > 1) {
      targetDir = await handle.getDirectoryHandle(parts[0], { create: true });
      targetFileName = parts[1];
    }
    const file = await targetDir.getFileHandle(targetFileName, { create: true });
    const writable = await file.createWritable();
    await writable.write(data as any);
    await writable.close();
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const handle = await this.getHandle();
      const parts = path.split('/');
      if (parts.length > 1) {
        const dir = await handle.getDirectoryHandle(parts[0], { create: false });
        await dir.getFileHandle(parts[1], { create: false });
      } else {
        await handle.getFileHandle(path, { create: false });
      }
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(dir?: string): Promise<string[]> {
    try {
      const handle = await this.getHandle();
      const results: string[] = [];
      const dirWithValues = handle as unknown as {
        values: () => AsyncIterable<FileSystemFileHandle | FileSystemDirectoryHandle>;
      };
      if (typeof dirWithValues.values === 'function') {
        for await (const entry of dirWithValues.values()) {
          if (entry.kind === 'file') {
            results.push(entry.name);
          }
        }
      }
      return results;
    } catch {
      return [];
    }
  }
}

export interface SessionMirrorAdapter {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  remove(key: string): Promise<void>;
}

export class InMemorySessionMirrorAdapter implements SessionMirrorAdapter {
  private store = new Map<string, any>();

  async get(key: string): Promise<any> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: any): Promise<void> {
    this.store.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export class ChromeSessionMirrorAdapter implements SessionMirrorAdapter {
  async get(key: string): Promise<any> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get(key);
      return result ? result[key] : null;
    }
    return null;
  }

  async set(key: string, value: any): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [key]: value });
    }
  }

  async remove(key: string): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(key);
    }
  }
}

export interface VaultRepositoryOptions {
  fsAdapter?: FileSystemAdapter;
  sessionMirror?: SessionMirrorAdapter;
}

export function sanitizeFileName(title: string): string {
  const clean = (title || 'Video Notes')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean ? `${clean}.md` : 'Video Notes.md';
}

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  if (typeof atob === 'function') {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  const buf = Buffer.from(base64, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export class VaultRepository {
  private fsAdapter: FileSystemAdapter | null;
  private sessionMirror: SessionMirrorAdapter | null;
  private isDiskAuthorized = true;
  private savedAttachmentKeys = new Set<string>();

  constructor(options: VaultRepositoryOptions = {}) {
    this.fsAdapter = options.fsAdapter || null;
    this.sessionMirror = options.sessionMirror || null;
  }

  setDiskAuthorized(authorized: boolean): void {
    this.isDiskAuthorized = authorized;
  }

  private getSessionKey(url: string, title?: string): string {
    const clean = (url || '').split('#')[0] || title || 'default';
    return `session_${clean}`;
  }

  async saveNote(doc: NoteDocument): Promise<SaveResult> {
    const fileName = doc.existingFileName || sanitizeFileName(doc.title);

    // Fallback transparently to session mirror when disk is unavailable or revoked
    if (!this.fsAdapter || !this.isDiskAuthorized) {
      if (this.sessionMirror) {
        const key = this.getSessionKey(doc.pageUrl, doc.title);
        await this.sessionMirror.set(key, {
          title: doc.title,
          markdown: doc.markdown,
          url: doc.pageUrl,
          frames: doc.frames || [],
          existingFileName: fileName,
          updatedAt: Date.now(),
        });
        return {
          status: 'saved',
          destination: 'session_mirror',
          fileName,
          content: doc.markdown,
          savedAttachmentCount: 0,
        };
      }
      throw new Error('No storage adapter available to persist note.');
    }
    let fullContent: string;
    let status: SaveStatus = 'saved';

    const diskExists = await this.fsAdapter.fileExists(fileName);
    if (diskExists) {
      const currentDiskText = await this.fsAdapter.readText(fileName);
      if (doc.baseContent && currentDiskText.trim() !== doc.baseContent.trim()) {
        // Disk changed externally! Merge non-destructively
        fullContent = mergeMarkdownNotes(currentDiskText, doc.markdown);
        status = 'merged';
      } else {
        const bodyContent = extractFrontmatter(doc.markdown).body.trim();
        const frontmatter = generateObsidianFrontmatter({
          title: doc.title,
          sourceUrl: doc.pageUrl,
        });
        fullContent = `${frontmatter}\n\n${bodyContent}\n`;
      }
    } else {
      const bodyContent = extractFrontmatter(doc.markdown).body.trim();
      const frontmatter = generateObsidianFrontmatter({
        title: doc.title,
        sourceUrl: doc.pageUrl,
      });
      fullContent = `${frontmatter}\n\n${bodyContent}\n`;
    }

    await this.fsAdapter.writeText(fileName, fullContent);

    // Save binary attachments to attachments/ subdirectory
    let savedAttachmentCount = 0;
    if (doc.frames && doc.frames.length > 0) {
      for (const frame of doc.frames) {
        if (!frame.dataUrl) continue;
        const attachmentName = frame.fileName || `frame_${frame.timestamp || 0}s.webp`;
        const relativePath = `attachments/${attachmentName}`;

        if (!this.savedAttachmentKeys.has(relativePath)) {
          const binary = dataUrlToUint8Array(frame.dataUrl);
          await this.fsAdapter.writeBinary(relativePath, binary);
          this.savedAttachmentKeys.add(relativePath);
          savedAttachmentCount++;
        }
      }
    }

    return {
      status,
      destination: 'vault_disk',
      fileName,
      content: fullContent,
      savedAttachmentCount,
    };
  }

  async loadNote(url: string, title?: string): Promise<NoteDocument | null> {
    if (this.fsAdapter && this.isDiskAuthorized) {
      const allFiles = await this.fsAdapter.listFiles();
      const mdFiles = allFiles.filter((f) => f.endsWith('.md') && !f.includes('/'));

      let matchedFileName: string | null = null;
      let matchedContent: string | null = null;

      // 1. Direct title/filename match
      if (title) {
        const candidateName = sanitizeFileName(title);
        if (await this.fsAdapter.fileExists(candidateName)) {
          matchedFileName = candidateName;
          matchedContent = await this.fsAdapter.readText(candidateName);
        }
      }

      // 2. URL search match in frontmatter
      if (!matchedContent && url) {
        const cleanUrl = url.split('#')[0].replace(/[?&]t=\d+s?/, '');
        for (const fileName of mdFiles) {
          try {
            const content = await this.fsAdapter.readText(fileName);
            if (content.includes(cleanUrl)) {
              matchedFileName = fileName;
              matchedContent = content;
              break;
            }
          } catch {
            // Continue search
          }
        }
      }

      if (matchedFileName && matchedContent) {
        const parsed = extractFrontmatter(matchedContent);
        const resolvedTitle = parsed.title || title || matchedFileName.replace(/\.md$/, '');
        const resolvedUrl = parsed.source || url;

        // Eagerly rehydrate referenced attachments
        const frameNames = parseFramesFromMarkdown(matchedContent);
        const frames: CapturedFrame[] = [];

        for (const rawName of frameNames) {
          const cleanBaseName = rawName.replace(/^attachments\//, '');
          const attachmentPath = `attachments/${cleanBaseName}`;

          if (await this.fsAdapter.fileExists(attachmentPath)) {
            try {
              const binary = await this.fsAdapter.readBinary(attachmentPath);
              const dataUrl = uint8ArrayToDataUrl(binary, 'image/webp');

              // Extract timestamp if encoded in filename (e.g. name_45s.webp)
              const tsMatch = cleanBaseName.match(/_(\d+)s\.webp$/i);
              const seconds = tsMatch ? parseInt(tsMatch[1], 10) : 0;

              frames.push({
                id: `frame-${cleanBaseName}`,
                timestamp: seconds,
                formattedTime: formatSeconds(seconds),
                dataUrl,
                fileName: cleanBaseName,
                pageTitle: resolvedTitle,
              });

              // Mark as saved so subsequent saves don't duplicate write
              this.savedAttachmentKeys.add(attachmentPath);
            } catch {
              // If attachment read fails, continue rehydrating other frames
            }
          }
        }

        return {
          title: resolvedTitle,
          markdown: parsed.body,
          frames,
          pageUrl: resolvedUrl,
          existingFileName: matchedFileName,
        };
      }
    }

    // Fallback: check session mirror if disk note was not found or unpermissioned
    if (this.sessionMirror) {
      const key = this.getSessionKey(url, title);
      const cached = await this.sessionMirror.get(key);
      if (cached) {
        return {
          title: cached.title || title || 'Video Notes',
          markdown: cached.markdown || '',
          frames: cached.frames || [],
          pageUrl: cached.url || url,
          existingFileName: cached.existingFileName,
        };
      }
    }

    return null;
  }
}

export function createDefaultVaultRepository(): VaultRepository {
  return new VaultRepository({
    fsAdapter: new ChromeFileSystemAdapter(() => getSavedVaultDirectory()),
    sessionMirror: new ChromeSessionMirrorAdapter(),
  });
}
