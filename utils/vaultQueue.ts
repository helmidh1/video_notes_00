import {
  saveMarkdownFileNonDestructive,
  saveBinaryAttachment,
  type SaveMarkdownOptions,
} from './vaultStorage';

interface QueueTask<T> {
  execute: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

/**
 * Thread-safe asynchronous queue that serializes disk writes to the Obsidian vault.
 * Prevents race conditions, Windows file lock contention, and simultaneous handle
 * mutation errors when multiple tabs or background streams commit data concurrently.
 */
class VaultWriteQueue {
  private queue: QueueTask<unknown>[] = [];
  private isProcessing = false;
  private activeLocks: Set<string> = new Set();

  /**
   * Enqueue a non-destructive markdown save task
   */
  async enqueueMarkdownSave(
    dirHandle: FileSystemDirectoryHandle,
    fileName: string,
    markdownContent: string,
    options: SaveMarkdownOptions = {}
  ): Promise<{ finalContent: string; wasMerged: boolean; lastModified: number }> {
    return this.enqueueTask(fileName, () =>
      saveMarkdownFileNonDestructive(dirHandle, fileName, markdownContent, options)
    );
  }

  /**
   * Enqueue a binary attachment write task
   */
  async enqueueAttachmentSave(
    dirHandle: FileSystemDirectoryHandle,
    fileName: string,
    dataUrl: string,
    subfolder: string = 'attachments'
  ): Promise<void> {
    return this.enqueueTask(`attachment_${fileName}`, () =>
      saveBinaryAttachment(dirHandle, fileName, dataUrl, subfolder)
    );
  }

  private enqueueTask<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: async () => {
          this.activeLocks.add(lockKey);
          try {
            const result = await fn();
            return result;
          } finally {
            this.activeLocks.delete(lockKey);
          }
        },
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      try {
        const result = await task.execute();
        task.resolve(result);
      } catch (err) {
        task.reject(err);
      }
    }

    this.isProcessing = false;
  }
}

// Global shared singleton queue
export const vaultQueue = new VaultWriteQueue();
