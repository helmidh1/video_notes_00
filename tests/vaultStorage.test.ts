import { describe, it, expect } from 'vitest';
import {
  saveMarkdownFileNonDestructive,
  readMarkdownFileWithMeta,
  findExistingNote,
} from '../utils/vaultStorage';

class MockFileHandle {
  kind = 'file' as const;
  constructor(public name: string, private data: { text: string; lastModified: number }) {}

  async getFile() {
    return {
      text: async () => this.data.text,
      slice: (start: number, end: number) => ({
        text: async () => this.data.text.slice(start, end),
      }),
      lastModified: this.data.lastModified,
    };
  }

  async createWritable() {
    return {
      write: async (content: string) => {
        this.data.text = content;
        this.data.lastModified = Date.now();
      },
      close: async () => {},
    };
  }
}

class MockDirectoryHandle {
  kind = 'directory' as const;
  public files = new Map<string, { text: string; lastModified: number }>();
  constructor(public name: string) {}

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (options?.create) {
        this.files.set(name, { text: '', lastModified: Date.now() });
      } else {
        throw new Error('NotFoundError');
      }
    }
    return new MockFileHandle(name, this.files.get(name)!);
  }

  async *values() {
    for (const [name, data] of this.files.entries()) {
      yield new MockFileHandle(name, data);
    }
  }
}

describe('Vault Storage Optimistic Concurrency and Non-Destructive Saving', () => {
  it('reads markdown file content and lastModified timestamp', async () => {
    const dir = new MockDirectoryHandle('Vault') as unknown as FileSystemDirectoryHandle;
    const mockDir = dir as unknown as MockDirectoryHandle;
    mockDir.files.set('Test-Note.md', { text: '# Hello World', lastModified: 1700000000000 });

    const result = await readMarkdownFileWithMeta(dir, 'Test-Note');
    expect(result).not.toBeNull();
    expect(result?.content).toBe('# Hello World');
    expect(result?.lastModified).toBe(1700000000000);
  });

  it('directly writes edits without resurrecting deleted text when baseContent matches disk', async () => {
    const dir = new MockDirectoryHandle('Vault') as unknown as FileSystemDirectoryHandle;
    const mockDir = dir as unknown as MockDirectoryHandle;

    const initialContent = `---
title: "Lecture"
---
# Lecture Notes
Line 1: important concept.
Line 2: concept that user decides to delete.
`;
    mockDir.files.set('Lecture.md', { text: initialContent, lastModified: 1000 });

    // User in extension deleted Line 2
    const updatedInEditor = `---
title: "Lecture"
---
# Lecture Notes
Line 1: important concept.
`;

    // Save with baseContent matching the disk content (no external modification occurred in Obsidian)
    const saveRes = await saveMarkdownFileNonDestructive(
      dir,
      'Lecture',
      updatedInEditor,
      { allowOverwrite: false, baseContent: initialContent }
    );

    expect(saveRes.wasMerged).toBe(false);
    expect(saveRes.finalContent).toBe(updatedInEditor);
    expect(mockDir.files.get('Lecture.md')?.text).toBe(updatedInEditor);
    // Deleted line must NOT be in the file
    expect(mockDir.files.get('Lecture.md')?.text).not.toContain('Line 2');
  });

  it('safely merges with external Obsidian edits when disk was modified externally (baseContent mismatch)', async () => {
    const dir = new MockDirectoryHandle('Vault') as unknown as FileSystemDirectoryHandle;
    const mockDir = dir as unknown as MockDirectoryHandle;

    const baseContent = `---
title: "Lecture"
---
# Original Notes
`;

    // Meanwhile, user went to Obsidian and added their own manual notes:
    const modifiedInObsidian = `---
title: "Lecture"
---
# Original Notes
User wrote custom research notes directly in Obsidian.
`;
    mockDir.files.set('Lecture.md', { text: modifiedInObsidian, lastModified: 2000 });

    // Extension concurrently snapped a new frame at 02:15
    const extensionNewFrame = `---
title: "Lecture"
---
# Original Notes

### [02:15]
![[frame-slide1.webp]]
`;

    const saveRes = await saveMarkdownFileNonDestructive(
      dir,
      'Lecture',
      extensionNewFrame,
      { allowOverwrite: false, baseContent } // baseContent is different from modifiedInObsidian!
    );

    expect(saveRes.wasMerged).toBe(true);
    // Must preserve Obsidian's manual edits!
    expect(saveRes.finalContent).toContain('User wrote custom research notes directly in Obsidian');
    // Must include newly snapped frame!
    expect(saveRes.finalContent).toContain('[02:15]');
    expect(saveRes.finalContent).toContain('frame-slide1.webp');
  });

  it('finds existing note by URL and returns exact filename and lastModified', async () => {
    const dir = new MockDirectoryHandle('Vault') as unknown as FileSystemDirectoryHandle;
    const mockDir = dir as unknown as MockDirectoryHandle;

    const fileContent = `---
title: "React Tutorial"
source: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
---
# React Notes
`;
    mockDir.files.set('Custom React Title.md', { text: fileContent, lastModified: 5000 });

    const match = await findExistingNote(dir, 'Different Title', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s');
    expect(match).not.toBeNull();
    expect(match?.fileName).toBe('Custom React Title.md');
    expect(match?.content).toBe(fileContent);
    expect(match?.lastModified).toBe(5000);
  });
});
