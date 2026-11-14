# Video Notes

A local-first, multimodal AI video note-taking workspace bridging web video players directly with local Obsidian vaults and Markdown documents.

## Language

**Note Document**:
The cohesive unit of video notes containing Markdown prose, frontmatter metadata, timestamp anchors, and referenced frame attachments for a specific video context.
_Avoid_: Note file, note record, scratchpad

**Vault**:
The user's local file directory containing Markdown notes and an `attachments/` subdirectory for Personal Knowledge Management (PKM), primarily in Obsidian.
_Avoid_: Storage directory, project folder, local workspace

**Attachment**:
A binary visual asset (such as a WebP video frame capture) persisted within the vault's `attachments/` directory and embedded in notes using Wikilink syntax (`![[...]]`).
_Avoid_: Screenshot file, frame image, media asset

**Session Mirror**:
A secondary browser-local storage cache (`chrome.storage.local`) that temporarily preserves note document states when direct vault disk permissions are unavailable.
_Avoid_: Local cache, fallback storage, backup draft
