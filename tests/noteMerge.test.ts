import { describe, it, expect } from 'vitest';
import {
  parseTimestampsFromMarkdown,
  parseFramesFromMarkdown,
  extractFrontmatter,
  mergeMarkdownNotes,
} from '../utils/noteMerge';

describe('Note Merge and Timestamp Parsing', () => {
  it('parses timestamps and associated frames from markdown', () => {
    const md = `---
title: "Sample Video"
---
# Sample Video Notes

### [01:15](https://youtube.com/watch?v=123#t=75s)
![[frame-100.webp]]
Introductory remarks about architecture.

### [04:30](https://youtube.com/watch?v=123#t=270s)
Deep dive into database shards.
> [!info] AI Frame Analysis (04:30)
> Shows diagram with 3 cluster nodes.
`;

    const timestamps = parseTimestampsFromMarkdown(md);
    expect(timestamps).toHaveLength(2);

    expect(timestamps[0].formattedTime).toBe('01:15');
    expect(timestamps[0].seconds).toBe(75);
    expect(timestamps[0].imageFileName).toBe('frame-100.webp');
    expect(timestamps[0].context).toContain('Introductory remarks');

    expect(timestamps[1].formattedTime).toBe('04:30');
    expect(timestamps[1].seconds).toBe(270);
    expect(timestamps[1].context).toContain('database shards');
  });

  it('strictly ignores frontmatter ISO dates and timestamps', () => {
    const md = `---
title: "Sample Video"
created: "2026-10-17T20:34:45.000Z"
updated: "2026-10-17T20:53:05.123Z"
source: "https://youtube.com/watch?v=123"
tags:
  - video-notes
---
# Video Notes

### [02:15](https://youtube.com/watch?v=123#t=135s)
First concept.

Ratio is 16:9 and aspect 4:3.
`;
    const timestamps = parseTimestampsFromMarkdown(md);
    expect(timestamps).toHaveLength(1);
    expect(timestamps[0].formattedTime).toBe('02:15');
    expect(timestamps[0].seconds).toBe(135);
  });

  it('extracts frames from markdown', () => {
    const md = `
![[frame-1.webp]]
Some text
![[frame-2.webp]]
`;
    const frames = parseFramesFromMarkdown(md);
    expect(frames).toEqual(['frame-1.webp', 'frame-2.webp']);
  });

  it('extracts YAML frontmatter properly', () => {
    const md = `---
title: "Test Title"
created: "2026-10-17T12:00:00Z"
source: "https://example.com"
tags:
  - tech
  - ai
---
# Main Content
Hello world`;

    const res = extractFrontmatter(md);
    expect(res.title).toBe('Test Title');
    expect(res.source).toBe('https://example.com');
    expect(res.tags).toEqual(['tech', 'ai']);
    expect(res.body).toContain('# Main Content\nHello world');
  });

  it('merges new timestamp without overwriting existing data', () => {
    const existing = `---
title: "Existing Video"
created: "2026-10-17T10:00:00Z"
source: "https://youtube.com/watch?v=abc"
tags:
  - video-notes
---

# Video Notes: Existing Video

### [01:00](https://youtube.com/watch?v=abc#t=60s)
![[frame-1.webp]]
First concept explained.
`;

    // Incoming markdown from new session (e.g. stopped video, came back at 03:00)
    const incoming = `### [03:00](https://youtube.com/watch?v=abc#t=180s)
![[frame-2.webp]]
Second concept explained.
`;

    const merged = mergeMarkdownNotes(existing, incoming);

    // Both timestamps must be in merged result!
    expect(merged).toContain('[01:00]');
    expect(merged).toContain('frame-1.webp');
    expect(merged).toContain('First concept explained');

    expect(merged).toContain('[03:00]');
    expect(merged).toContain('frame-2.webp');
    expect(merged).toContain('Second concept explained');

    // Preserved frontmatter created date
    expect(merged).toContain('created: "2026-10-17T10:00:00Z"');
  });

  it('does NOT duplicate identical timestamps or frames', () => {
    const existing = `---
title: "Existing Video"
---

### [01:00](https://youtube.com/watch?v=abc#t=60s)
![[frame-1.webp]]
First concept.
`;

    const incoming = `### [01:00](https://youtube.com/watch?v=abc#t=60s)
![[frame-1.webp]]
First concept.
`;

    const merged = mergeMarkdownNotes(existing, incoming);
    const count = (merged.match(/frame-1\.webp/g) || []).length;
    expect(count).toBe(1);
  });

  it('sorts new timestamps chronologically when inserted', () => {
    const existing = `---
title: "Lecture"
---

### [05:00]
Middle topic.
`;

    const incoming = `### [02:00]
Earlier topic.
`;

    const merged = mergeMarkdownNotes(existing, incoming);
    const idxEarlier = merged.indexOf('[02:00]');
    const idxLater = merged.indexOf('[05:00]');

    expect(idxEarlier).toBeGreaterThan(-1);
    expect(idxLater).toBeGreaterThan(-1);
    expect(idxEarlier).toBeLessThan(idxLater);
  });

  it('preserves manual modifications in Obsidian and does not resurrect deleted prose', () => {
    // Existing note in Obsidian where user manually refined notes and removed a section
    const existingInObsidian = `---
title: "Physics 101"
created: "2026-10-17T10:00:00Z"
tags:
  - physics
---

# Physics 101 Notes

### [01:00]
Refined explanation manually written in Obsidian by user.
`;

    // Stale incoming copy from extension containing the deleted paragraph
    const staleFromExtension = `---
title: "Physics 101"
---

# Physics 101 Notes

### [01:00]
Original unedited explanation.

Unwanted section deleted by user in Obsidian.
`;

    const merged = mergeMarkdownNotes(existingInObsidian, staleFromExtension);

    // Must preserve user's manual edit
    expect(merged).toContain('Refined explanation manually written in Obsidian by user');
    // Must NOT resurrect the deleted paragraph
    expect(merged).not.toContain('Unwanted section deleted by user in Obsidian');
  });

  it('integrates newly snapped frames into a manually modified Obsidian note', () => {
    const existingInObsidian = `---
title: "Chemistry"
---

# Chemistry Notes
User wrote custom summary here.
`;

    // Extension snapped a new frame at 04:15
    const incomingWithFrame = `### [04:15]
![[frame-flask.webp]]
> [!info] AI Frame Analysis (04:15)
> Chemical reaction with bubbles
`;

    const merged = mergeMarkdownNotes(existingInObsidian, incomingWithFrame);

    expect(merged).toContain('User wrote custom summary here');
    expect(merged).toContain('[04:15]');
    expect(merged).toContain('frame-flask.webp');
    expect(merged).toContain('Chemical reaction with bubbles');
  });

  it('preserves ### headers and timestamped caption bullets when merging into an existing note', () => {
    const existing = `---
title: "Lecture 3"
url: "https://youtube.com/watch?v=cap123"
---
# Lecture 3

### [00:30](https://youtube.com/watch?v=cap123#t=30s)
![[frame-30.webp]]

- [00:45](https://youtube.com/watch?v=cap123#t=45s) First spoken sentence in the lecture.
`;

    const incoming = `---
title: "Lecture 3"
url: "https://youtube.com/watch?v=cap123"
---
# Lecture 3

### [00:30](https://youtube.com/watch?v=cap123#t=30s)
![[frame-30.webp]]

- [00:45](https://youtube.com/watch?v=cap123#t=45s) First spoken sentence in the lecture.
- [01:10](https://youtube.com/watch?v=cap123#t=70s) Second spoken sentence added later.

### [01:25](https://youtube.com/watch?v=cap123#t=85s)
![[frame-85.webp]]
`;

    const merged = mergeMarkdownNotes(existing, incoming);
    expect(merged).toContain('### [00:30](https://youtube.com/watch?v=cap123#t=30s)');
    expect(merged).toContain('![[frame-30.webp]]');
    expect(merged).toContain('- [00:45](https://youtube.com/watch?v=cap123#t=45s) First spoken sentence in the lecture.');
    expect(merged).toContain('- [01:10](https://youtube.com/watch?v=cap123#t=70s) Second spoken sentence added later.');
    expect(merged).toContain('### [01:25](https://youtube.com/watch?v=cap123#t=85s)');
    expect(merged).toContain('![[frame-85.webp]]');
    // Should deduplicate the [00:45] caption line rather than duplicating it
    expect(merged.match(/First spoken sentence in the lecture\./g)).toHaveLength(1);
    // Consecutive caption bullets should be separated cleanly by a single newline
    expect(merged).toContain(
      '- [00:45](https://youtube.com/watch?v=cap123#t=45s) First spoken sentence in the lecture.\n- [01:10](https://youtube.com/watch?v=cap123#t=70s) Second spoken sentence added later.'
    );
  });

  it('allows same-second caption bullets and ### snapshot headers to coexist chronologically', () => {
    const existing = `---
title: "Dual Same Second"
url: "https://youtube.com/watch?v=dual99"
---
# Dual Same Second

- [01:15](https://youtube.com/watch?v=dual99#t=75s) Spoken remark at 01:15.
`;

    const incoming = `---
title: "Dual Same Second"
url: "https://youtube.com/watch?v=dual99"
---
# Dual Same Second

### [01:15](https://youtube.com/watch?v=dual99#t=75s)
![[frame-75.webp]]

- [01:15](https://youtube.com/watch?v=dual99#t=75s) Spoken remark at 01:15.
`;

    const merged = mergeMarkdownNotes(existing, incoming);
    expect(merged).toContain('- [01:15](https://youtube.com/watch?v=dual99#t=75s) Spoken remark at 01:15.');
    expect(merged).toContain('### [01:15](https://youtube.com/watch?v=dual99#t=75s)');
    expect(merged).toContain('![[frame-75.webp]]');
  });
});
