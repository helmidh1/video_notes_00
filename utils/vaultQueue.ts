/**
 * Serialized Mutex Queue for Obsidian Vault Writes
 *
 * Ensures that concurrent writes from auto-saves, user manual saves, and background sessions
 * are executed sequentially per target file path. This prevents Windows file lock contention
 * (EBUSY / Access Denied) when Obsidian and the extension touch the file at the same moment.
 */

type AsyncQueueTask<T> = () => Promise<T>;

const queueMap = new Map<string, Promise<unknown>>();

export function enqueueVaultOperation<T>(
  targetPath: string,
  operation: AsyncQueueTask<T>
): Promise<T> {
  const normalizedKey = targetPath.toLowerCase().replace(/\\/g, '/').trim();
  const existingQueue = queueMap.get(normalizedKey) || Promise.resolve();

  const nextOperation = existingQueue
    .catch(() => {}) // Don't let previous failures block future operations
    .then(async () => {
      return await operation();
    });

  queueMap.set(
    normalizedKey,
    nextOperation.finally(() => {
      if (queueMap.get(normalizedKey) === nextOperation) {
        queueMap.delete(normalizedKey);
      }
    })
  );

  return nextOperation as Promise<T>;
}
