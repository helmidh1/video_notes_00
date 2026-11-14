import { describe, it, expect, beforeEach } from 'vitest';
import {
  VaultRepository,
  InMemoryFileSystemAdapter,
  InMemorySessionMirrorAdapter,
  type NoteDocument,
} from '../utils/vaultRepository';

describe('VaultRepository - Slice 1: Basic Markdown Persistence', () => {
  let fs: InMemoryFileSystemAdapter;
  let repo: VaultRepository;

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    repo = new VaultRepository({ fsAdapter: fs });
  });

  it('saves a new NoteDocument as markdown to disk with frontmatter', async () => {
    const doc: NoteDocument = {
      title: 'React Hooks Guide',
      markdown: '## Understanding useState\n\nState allows functional components to hold state.',
      frames: [],
      pageUrl: 'https://www.youtube.com/watch?v=hooks101',
    };

    const result = await repo.saveNote(doc);

    expect(result.status).toBe('saved');
    expect(result.destination).toBe('vault_disk');
    expect(result.fileName).toBe('React Hooks Guide.md');
    expect(result.savedAttachmentCount).toBe(0);

    // Verify file written to adapter
    const savedContent = await fs.readText('React Hooks Guide.md');
    expect(savedContent).toContain('source: "https://www.youtube.com/watch?v=hooks101"');
    expect(savedContent).toContain('## Understanding useState');
  });

  it('sanitizes unsafe characters in note title for file name', async () => {
    const doc: NoteDocument = {
      title: 'Advanced React: Hooks / Patterns & Tips?',
      markdown: 'Some content',
      frames: [],
      pageUrl: 'https://youtube.com/watch?v=adv101',
    };

    const result = await repo.saveNote(doc);

    expect(result.fileName).toBe('Advanced React Hooks Patterns & Tips.md');
    expect(await fs.fileExists('Advanced React Hooks Patterns & Tips.md')).toBe(true);
  });
});

describe('VaultRepository - Slice 2: Attachment Serialization & Deduplication', () => {
  let fs: InMemoryFileSystemAdapter;
  let repo: VaultRepository;
  const sampleBase64Webp = 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoB+AA/vMF2AAA=';

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    repo = new VaultRepository({ fsAdapter: fs });
  });

  it('saves binary WebP frames to attachments/ and increments savedAttachmentCount', async () => {
    const doc: NoteDocument = {
      title: 'Lecture 1',
      markdown: '## Slide 1\n\n![[attachments/lecture_1_45s.webp]]',
      frames: [
        {
          id: 'frame-1',
          timestamp: 45,
          formattedTime: '00:45',
          dataUrl: sampleBase64Webp,
          fileName: 'lecture_1_45s.webp',
          pageTitle: 'Lecture 1',
        },
      ],
      pageUrl: 'https://youtube.com/watch?v=lec1',
    };

    const result = await repo.saveNote(doc);

    expect(result.status).toBe('saved');
    expect(result.savedAttachmentCount).toBe(1);

    // Verify attachment file exists in attachments/ directory
    expect(await fs.fileExists('attachments/lecture_1_45s.webp')).toBe(true);
    const binaryData = await fs.readBinary('attachments/lecture_1_45s.webp');
    expect(binaryData.length).toBeGreaterThan(0);
  });

  it('deduplicates unchanged attachments on subsequent saves', async () => {
    const doc: NoteDocument = {
      title: 'Lecture 1',
      markdown: '## Slide 1\n\n![[attachments/lecture_1_45s.webp]]',
      frames: [
        {
          id: 'frame-1',
          timestamp: 45,
          formattedTime: '00:45',
          dataUrl: sampleBase64Webp,
          fileName: 'lecture_1_45s.webp',
          pageTitle: 'Lecture 1',
        },
      ],
      pageUrl: 'https://youtube.com/watch?v=lec1',
    };

    const firstSave = await repo.saveNote(doc);
    expect(firstSave.savedAttachmentCount).toBe(1);

    // Second save with unchanged frames
    const secondSave = await repo.saveNote(doc);
    expect(secondSave.savedAttachmentCount).toBe(0);

    // Add a second frame
    const updatedDoc: NoteDocument = {
      ...doc,
      frames: [
        ...doc.frames,
        {
          id: 'frame-2',
          timestamp: 90,
          formattedTime: '01:30',
          dataUrl: sampleBase64Webp,
          fileName: 'lecture_1_90s.webp',
          pageTitle: 'Lecture 1',
        },
      ],
    };

    const thirdSave = await repo.saveNote(updatedDoc);
    expect(thirdSave.savedAttachmentCount).toBe(1);
    expect(await fs.fileExists('attachments/lecture_1_90s.webp')).toBe(true);
  });
});

describe('VaultRepository - Slice 3: Eager Attachment Rehydration in loadNote()', () => {
  let fs: InMemoryFileSystemAdapter;
  let repo: VaultRepository;
  const sampleBase64Webp = 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoB+AA/vMF2AAA=';

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    repo = new VaultRepository({ fsAdapter: fs });
  });

  it('loads an existing note by URL and eagerly rehydrates frame attachments', async () => {
    const rawMarkdown = `---
title: "Algorithms 101"
source: "https://coursera.org/learn/algorithms-part1/lecture/sort"
---

# Sorting Overview

![[attachments/algo_101_45s.webp]]

Here is the quicksort partition logic.

![[attachments/algo_101_120s.webp]]
`;

    // Seed file system with note and attachments
    await fs.writeText('Algorithms 101.md', rawMarkdown);
    const fakeBinary = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]);
    await fs.writeBinary('attachments/algo_101_45s.webp', fakeBinary);
    await fs.writeBinary('attachments/algo_101_120s.webp', fakeBinary);

    const loaded = await repo.loadNote('https://coursera.org/learn/algorithms-part1/lecture/sort', 'Algorithms 101');

    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe('Algorithms 101');
    expect(loaded!.pageUrl).toBe('https://coursera.org/learn/algorithms-part1/lecture/sort');
    expect(loaded!.existingFileName).toBe('Algorithms 101.md');
    expect(loaded!.markdown).toContain('# Sorting Overview');

    // Verify frames rehydration
    expect(loaded!.frames.length).toBe(2);
    expect(loaded!.frames[0].fileName).toBe('algo_101_45s.webp');
    expect(loaded!.frames[0].dataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(loaded!.frames[1].fileName).toBe('algo_101_120s.webp');
    expect(loaded!.frames[1].dataUrl).toMatch(/^data:image\/webp;base64,/);
  });

  it('returns null if note does not exist on disk', async () => {
    const loaded = await repo.loadNote('https://unknown.com/video', 'Nonexistent Note');
    expect(loaded).toBeNull();
  });
});

describe('VaultRepository - Slice 4: Optimistic Concurrency Control & Non-Destructive Merging', () => {
  let fs: InMemoryFileSystemAdapter;
  let repo: VaultRepository;

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    repo = new VaultRepository({ fsAdapter: fs });
  });

  it('performs non-destructive AST merge when file was modified externally in Obsidian', async () => {
    // Initial file on disk
    const initialContent = `---
title: "Distributed Systems"
source: "https://youtube.com/watch?v=dist1"
---

### [01:00] Consensus Protocols
Paxos and Raft overview.
`;
    await fs.writeText('Distributed Systems.md', initialContent);

    // User in Obsidian externally appends an edit:
    const externalObsidianContent = `---
title: "Distributed Systems"
source: "https://youtube.com/watch?v=dist1"
---

### [01:00] Consensus Protocols
Paxos and Raft overview.

### [02:30] External Note From Obsidian
Byzantine fault tolerance is essential.
`;
    await fs.writeText('Distributed Systems.md', externalObsidianContent);

    // Meanwhile, user in Video Notes extension appends a new timestamp at 04:00
    const extensionDoc: NoteDocument = {
      title: 'Distributed Systems',
      markdown: `### [01:00] Consensus Protocols\nPaxos and Raft overview.\n\n### [04:00] Leader Election\nHeartbeat intervals.`,
      frames: [],
      pageUrl: 'https://youtube.com/watch?v=dist1',
      existingFileName: 'Distributed Systems.md',
      baseContent: initialContent, // The snapshot extension had before Obsidian edit
    };

    const saveResult = await repo.saveNote(extensionDoc);

    expect(saveResult.status).toBe('merged');
    expect(saveResult.destination).toBe('vault_disk');

    // Verify disk content preserves BOTH external Obsidian note AND new extension timestamp!
    const diskContent = await fs.readText('Distributed Systems.md');
    expect(diskContent).toContain('Byzantine fault tolerance is essential');
    expect(diskContent).toContain('Leader Election');
    expect(diskContent).toContain('[04:00]');
  });
});

describe('VaultRepository - Slice 5: Transparent Session Mirror Fallback', () => {
  let fs: InMemoryFileSystemAdapter;
  let mirror: InMemorySessionMirrorAdapter;
  let repo: VaultRepository;

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    mirror = new InMemorySessionMirrorAdapter();
    repo = new VaultRepository({ fsAdapter: fs, sessionMirror: mirror });
  });

  it('transparently saves to session mirror when vault disk access is unpermissioned', async () => {
    // Revoke disk permission on repo
    repo.setDiskAuthorized(false);

    const doc: NoteDocument = {
      title: 'Operating Systems Note',
      markdown: '## Memory Management\nPaging and segmentation.',
      frames: [],
      pageUrl: 'https://youtube.com/watch?v=os101',
    };

    const result = await repo.saveNote(doc);

    expect(result.status).toBe('saved');
    expect(result.destination).toBe('session_mirror');

    // Verify written to session mirror
    const mirrored = await mirror.get('session_https://youtube.com/watch?v=os101');
    expect(mirrored).not.toBeNull();
    expect(mirrored.title).toBe('Operating Systems Note');
    expect(mirrored.markdown).toContain('Memory Management');

    // Verify it was NOT written to disk
    expect(await fs.fileExists('Operating Systems Note.md')).toBe(false);
  });

  it('loads note from session mirror when not found on disk', async () => {
    // Seed session mirror
    await mirror.set('session_https://youtube.com/watch?v=os101', {
      title: 'Operating Systems Note',
      markdown: '## Memory Management\nPaging and segmentation.',
      url: 'https://youtube.com/watch?v=os101',
      frames: [],
      updatedAt: Date.now(),
    });

    const loaded = await repo.loadNote('https://youtube.com/watch?v=os101', 'Operating Systems Note');

    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe('Operating Systems Note');
    expect(loaded!.markdown).toContain('Memory Management');
  });
});




