import { describe, it, expect } from 'vitest';
import { vaultQueue } from '../utils/vaultQueue';

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

describe('vaultQueue - Concurrency Safe Queue for Multi-Tab Notes', () => {
  it('serializes simultaneous writes to multiple notes without data collision', async () => {
    const dir = new MockDirectoryHandle('Vault') as unknown as FileSystemDirectoryHandle;
    const mockDir = dir as unknown as MockDirectoryHandle;

    const noteAContent = '# Note A (Quantum Computing)\nTimestamp: [01:23]';
    const noteBContent = '# Note B (Algorithms)\nTimestamp: [05:40]';

    // Fire both saves concurrently at the exact same tick
    const [resA, resB] = await Promise.all([
      vaultQueue.enqueueMarkdownSave(dir, 'Quantum Computing', noteAContent),
      vaultQueue.enqueueMarkdownSave(dir, 'Algorithms', noteBContent),
    ]);

    expect(resA.finalContent).toBe(noteAContent);
    expect(resB.finalContent).toBe(noteBContent);

    // Verify both files exist with pristine isolated contents
    expect(mockDir.files.has('Quantum Computing.md')).toBe(true);
    expect(mockDir.files.has('Algorithms.md')).toBe(true);
    expect(mockDir.files.get('Quantum Computing.md')?.text).toBe(noteAContent);
    expect(mockDir.files.get('Algorithms.md')?.text).toBe(noteBContent);
  });

  it('preserves distinct file outputs when multiple rapid saves are enqueued for different tabs', async () => {
    const dir = new MockDirectoryHandle('Vault') as unknown as FileSystemDirectoryHandle;
    const mockDir = dir as unknown as MockDirectoryHandle;

    const tasks: Promise<unknown>[] = [];
    for (let i = 1; i <= 5; i++) {
      tasks.push(
        vaultQueue.enqueueMarkdownSave(
          dir,
          `Lecture-${i}`,
          `# Lecture ${i} Content\nSegment ${i}`
        )
      );
    }

    await Promise.all(tasks);

    for (let i = 1; i <= 5; i++) {
      expect(mockDir.files.has(`Lecture-${i}.md`)).toBe(true);
      expect(mockDir.files.get(`Lecture-${i}.md`)?.text).toBe(
        `# Lecture ${i} Content\nSegment ${i}`
      );
    }
  });
});
