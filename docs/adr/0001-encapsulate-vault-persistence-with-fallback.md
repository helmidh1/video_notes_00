# 0001. Encapsulate Vault Persistence with Fallback and OCC

## Status
accepted

## Context
Persisting notes from the Chrome Side Panel into a user's local Obsidian vault previously required `App.tsx` to directly coordinate fifteen procedural functions across `vaultStorage.ts` and `noteMerge.ts`. This leaked low-level `FileSystemDirectoryHandle` management, binary WebP attachment conversions, IndexedDB caching, optimistic concurrency control (OCC), and fallback mirroring to `chrome.storage.local` across more than 350 lines of React UI code, making the persistence workflow hard to test headlessly.

## Decision
We consolidate vault persistence, attachment serialization, and optimistic concurrency control into a deep `VaultRepository` module backed by an internal `FileSystemAdapter` seam. The repository accepts and returns high-level `NoteDocument` domain objects, eagerly rehydrates frame attachments, deduplicates binary writes, performs automated non-destructive AST merging, and transparently falls back to `chrome.storage.local` session mirroring when disk permissions are unavailable.

## Consequences
- `App.tsx` and UI components interact with a single `VaultRepository` interface rather than juggling raw file handles, permission checks, and frame loops.
- An `InMemoryFileSystemAdapter` enables fast, headless integration testing of the entire persistence, attachment, and OCC workflow in Vitest without browser DOM or IndexedDB dependencies.
- External disk modifications are observed via an `onExternalChange` subscription, eliminating manual polling intervals and ref checks from React component renders.
