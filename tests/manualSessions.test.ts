import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sanitizeFileName,
  sanitizeFolderPath,
  getAllManualSessions,
  getActiveManualSessionId,
  setActiveManualSessionId,
  saveManualSession,
  createManualSession,
  deleteManualSession,
  getOrCreateCurrentManualSession,
  type ManualSession,
} from '../utils/sessionManager';
import {
  resolveDirectoryHandle,
  getDirectoryHandleIfExists,
  generateObsidianFrontmatter,
} from '../utils/vaultStorage';
import { enqueueVaultOperation } from '../utils/vaultQueue';

// Mock chrome.storage.local
const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys: string[]) => {
        const res: Record<string, unknown> = {};
        for (const k of keys) {
          if (mockStorage[k] !== undefined) {
            res[k] = mockStorage[k];
          }
        }
        return Promise.resolve(res);
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string[]) => {
        for (const k of keys) {
          delete mockStorage[k];
        }
        return Promise.resolve();
      }),
    },
  },
});

describe('Manual Session Manager', () => {
  beforeEach(() => {
    for (const k in mockStorage) {
      delete mockStorage[k];
    }
    vi.clearAllMocks();
  });

  describe('Sanitization helpers', () => {
    it('sanitizes unsafe filename characters and strips .md', () => {
      expect(sanitizeFileName('CS50: Lecture 1 / Intro <C>?.md')).toBe('CS50- Lecture 1 - Intro -C-');
      expect(sanitizeFileName('')).toBe('Video-Note');
      expect(sanitizeFileName('   ')).toBe('Video-Note');
    });

    it('sanitizes folder paths and normalizes slashes', () => {
      expect(sanitizeFolderPath('Courses\\Math/Linear Algebra/')).toBe('Courses/Math/Linear Algebra');
      expect(sanitizeFolderPath('Courses/Math:101/Intro*')).toBe('Courses/Math-101/Intro-');
      expect(sanitizeFolderPath('')).toBe('');
      expect(sanitizeFolderPath('/')).toBe('');
    });
  });

  describe('Session CRUD operations', () => {
    it('creates and retrieves a new manual session with tab link and folder path', async () => {
      const session = await createManualSession({
        name: 'Calculus III',
        linkedTabId: 42,
        linkedUrl: 'https://youtube.com/watch?v=calc123',
        linkedTitle: 'Calculus III - Vectors',
        obsidianFileName: 'Calculus Vectors',
        obsidianFolderPath: 'Courses/Math',
        markdown: '# Vectors Notes',
      });

      expect(session.id).toBeDefined();
      expect(session.name).toBe('Calculus III');
      expect(session.linkedTabId).toBe(42);
      expect(session.obsidianFolderPath).toBe('Courses/Math');
      expect(session.obsidianFileName).toBe('Calculus Vectors');

      const all = await getAllManualSessions();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(session.id);

      const activeId = await getActiveManualSessionId();
      expect(activeId).toBe(session.id);
    });

    it('creates multiple sessions with different Obsidian targets and preserves isolation', async () => {
      const s1 = await createManualSession({
        name: 'Session 1: Algorithms',
        linkedTabId: 10,
        linkedUrl: 'https://youtube.com/watch?v=algo',
        obsidianFileName: 'Algorithms Note',
        obsidianFolderPath: 'Computer Science',
      });

      const s2 = await createManualSession({
        name: 'Session 2: Biology',
        linkedTabId: 20,
        linkedUrl: 'https://youtube.com/watch?v=bio',
        obsidianFileName: 'Biology Cells',
        obsidianFolderPath: 'Science/Bio',
      });

      const all = await getAllManualSessions();
      expect(all).toHaveLength(2);

      // Verify Session 1 targets
      const foundS1 = all.find((s) => s.id === s1.id);
      expect(foundS1?.obsidianFileName).toBe('Algorithms Note');
      expect(foundS1?.obsidianFolderPath).toBe('Computer Science');
      expect(foundS1?.linkedTabId).toBe(10);

      // Verify Session 2 targets
      const foundS2 = all.find((s) => s.id === s2.id);
      expect(foundS2?.obsidianFileName).toBe('Biology Cells');
      expect(foundS2?.obsidianFolderPath).toBe('Science/Bio');
      expect(foundS2?.linkedTabId).toBe(20);

      // Verify active session was switched to s2 upon creation
      const activeId = await getActiveManualSessionId();
      expect(activeId).toBe(s2.id);
    });

    it('updates session content and metadata without touching other sessions', async () => {
      const s1 = await createManualSession({
        name: 'Math',
        markdown: 'Initial math',
      });
      const s2 = await createManualSession({
        name: 'History',
        markdown: 'Initial history',
      });

      await saveManualSession({
        ...s1,
        markdown: 'Updated math note content with timestamps',
      });

      const all = await getAllManualSessions();
      const updatedS1 = all.find((s) => s.id === s1.id);
      const unchangedS2 = all.find((s) => s.id === s2.id);

      expect(updatedS1?.markdown).toBe('Updated math note content with timestamps');
      expect(unchangedS2?.markdown).toBe('Initial history');
    });

    it('deletes a session and updates the active session if deleted was active', async () => {
      const s1 = await createManualSession({ name: 'S1' });
      const s2 = await createManualSession({ name: 'S2' });

      expect(await getActiveManualSessionId()).toBe(s2.id);

      await deleteManualSession(s2.id);

      const all = await getAllManualSessions();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(s1.id);

      // Active ID automatically fell back to s1
      expect(await getActiveManualSessionId()).toBe(s1.id);
    });

    it('initializes a default session from active tab if no sessions exist', async () => {
      const { session, isNew } = await getOrCreateCurrentManualSession({
        id: 77,
        url: 'https://youtube.com/watch?v=intro',
        title: 'Introduction to Python',
      });

      expect(isNew).toBe(true);
      expect(session.name).toBe('Introduction to Python');
      expect(session.linkedTabId).toBe(77);
      expect(session.obsidianFileName).toBe('Introduction to Python');
      expect(session.obsidianFolderPath).toBe('');

      // Calling again returns existing session
      const secondCall = await getOrCreateCurrentManualSession();
      expect(secondCall.isNew).toBe(false);
      expect(secondCall.session.id).toBe(session.id);
    });
  });

  describe('Thread-Safe Vault Queue', () => {
    it('executes concurrent write tasks sequentially per path', async () => {
      const callOrder: string[] = [];

      const p1 = enqueueVaultOperation('Math/Calculus.md', async () => {
        await new Promise((r) => setTimeout(r, 20));
        callOrder.push('first');
        return 1;
      });

      const p2 = enqueueVaultOperation('Math/Calculus.md', async () => {
        callOrder.push('second');
        return 2;
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(1);
      expect(r2).toBe(2);
      expect(callOrder).toEqual(['first', 'second']);
    });
  });

  describe('Vault Subfolder Handle Resolution', () => {
    it('returns root handle when folderPath is empty or root', async () => {
      const mockRoot = { name: 'vault', kind: 'directory' } as unknown as FileSystemDirectoryHandle;
      const resolved = await resolveDirectoryHandle(mockRoot, '');
      expect(resolved).toBe(mockRoot);

      const resolvedSlash = await resolveDirectoryHandle(mockRoot, '/');
      expect(resolvedSlash).toBe(mockRoot);
    });

    it('traverses nested path segments sequentially', async () => {
      const subDir2 = { name: 'CS50', kind: 'directory' };
      const subDir1 = {
        name: 'Courses',
        kind: 'directory',
        getDirectoryHandle: vi.fn().mockResolvedValue(subDir2),
      };
      const mockRoot = {
        name: 'vault',
        kind: 'directory',
        getDirectoryHandle: vi.fn().mockResolvedValue(subDir1),
      } as unknown as FileSystemDirectoryHandle;

      const result = await resolveDirectoryHandle(mockRoot, 'Courses/CS50', true);
      expect(result).toBe(subDir2);
      expect(mockRoot.getDirectoryHandle).toHaveBeenCalledWith('Courses', { create: true });
      expect(subDir1.getDirectoryHandle).toHaveBeenCalledWith('CS50', { create: true });
    });
  });
});
