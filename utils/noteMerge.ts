import { formatSeconds, parseTimeStringToSeconds } from './transcriptExtractor';

export interface ParsedTimestamp {
  id: string;
  raw: string;
  formattedTime: string;
  seconds: number;
  headerText?: string;
  context: string;
  imageFileName?: string;
  line: number;
}

export interface ParsedFrontmatter {
  raw: string;
  body: string;
  title?: string;
  source?: string;
  created?: string;
  updated?: string;
  tags?: string[];
}

/**
 * Splits a markdown document into YAML frontmatter and body.
 */
export function extractFrontmatter(markdown: string): ParsedFrontmatter {
  const trimmed = markdown.trimStart();
  if (!trimmed.startsWith('---')) {
    return { raw: '', body: markdown };
  }

  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { raw: '', body: markdown };
  }

  const raw = match[1];
  const body = match[2];

  let title: string | undefined;
  let source: string | undefined;
  let created: string | undefined;
  let updated: string | undefined;
  const tags: string[] = [];

  const titleMatch = raw.match(/title:\s*["']?(.*?)["']?$/m);
  if (titleMatch) title = titleMatch[1];

  const sourceMatch = raw.match(/source:\s*["']?(.*?)["']?$/m);
  if (sourceMatch) source = sourceMatch[1];

  const createdMatch = raw.match(/created:\s*["']?(.*?)["']?$/m);
  if (createdMatch) created = createdMatch[1];

  const updatedMatch = raw.match(/updated:\s*["']?(.*?)["']?$/m);
  if (updatedMatch) updated = updatedMatch[1];

  const tagsMatch = raw.match(/tags:\s*\n((?:\s*-\s*[^\n]+\n?)+)/);
  if (tagsMatch) {
    const lines = tagsMatch[1].split('\n');
    for (const line of lines) {
      const tag = line.replace(/^\s*-\s*/, '').trim();
      if (tag) tags.push(tag);
    }
  }

  return { raw, body, title, source, created, updated, tags };
}

/**
 * Reconstructs or updates YAML frontmatter.
 */
export function buildFrontmatter(data: {
  title?: string;
  source?: string;
  created?: string;
  updated?: string;
  tags?: string[];
}): string {
  const title = (data.title || 'Video Note').replace(/"/g, '\\"');
  const source = data.source || '';
  const created = data.created || new Date().toISOString();
  const updated = data.updated || new Date().toISOString();
  const tags = data.tags && data.tags.length > 0 ? data.tags : ['video-notes', 'study'];

  const tagsYaml = tags.map((t) => `  - ${t}`).join('\n');

  return `---
title: "${title}"
created: "${created}"
updated: "${updated}"
source: "${source}"
tags:
${tagsYaml}
---

`;
}

/**
 * Extracts all interactive timestamps and attached frame filenames from markdown.
 * Guaranteed to ignore YAML frontmatter ISO dates/timestamps and prose numbers.
 */
export function parseTimestampsFromMarkdown(markdown: string): ParsedTimestamp[] {
  if (!markdown) return [];

  // 1. Strip YAML frontmatter completely so ISO dates (e.g. updated: "2026-10-17T20:53:05") are never parsed
  const { body } = extractFrontmatter(markdown);
  const lines = body.split(/\r?\n/);
  const timestamps: ParsedTimestamp[] = [];
  const seenSeconds = new Set<number>();

  // Strict pattern for genuine video timestamps:
  // 1. Heading or bracketed: ### [01:23] or ### [01:23](...) or [01:23] or [01:23](...)
  // 2. Heading without brackets: ### 01:23
  // Group 1/4: optional HH:
  // Group 2/5: MM (1 to 3 digits)
  // Group 3/6: SS (00 to 59)
  const timestampRegex = /(?:###\s+)?\[(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)\](?:\([^)]*\))?|(?:###\s+)(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    let match: RegExpExecArray | null;
    timestampRegex.lastIndex = 0;

    while ((match = timestampRegex.exec(line)) !== null) {
      const fullMatch = match[0];
      const hh = match[1] || match[4];
      const mm = match[2] || match[5];
      const ss = match[3] || match[6];
      const timePart = (hh ? `${hh}:` : '') + `${mm.padStart(2, '0')}:${ss}`;
      const seconds = parseTimeStringToSeconds(timePart);

      // Avoid immediate duplicate match on the exact same second & line
      const key = seconds;
      if (seenSeconds.has(key)) {
        continue;
      }
      seenSeconds.add(key);

      // Search next 3 lines for image embed and contextual text
      let imageFileName: string | undefined;
      const contextLines: string[] = [];

      for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
        const nextLine = lines[j].trim();
        if (nextLine.startsWith('### ') || nextLine.startsWith('## ') || nextLine.startsWith('# ')) {
          break; // Stop at next section
        }
        const imgMatch = nextLine.match(/!\[\[(.*?)\]\]/);
        if (imgMatch && !imageFileName) {
          imageFileName = imgMatch[1];
        } else if (nextLine && !nextLine.startsWith('>') && !nextLine.startsWith('![')) {
          contextLines.push(nextLine);
        } else if (nextLine.startsWith('> [!info]') || nextLine.startsWith('>')) {
          contextLines.push(nextLine.replace(/^>\s*(\[!info\])?\s*/, ''));
        }
      }

      // Check same line for image
      const sameLineImg = line.match(/!\[\[(.*?)\]\]/);
      if (sameLineImg && !imageFileName) {
        imageFileName = sameLineImg[1];
      }

      // Fallback context: clean line itself without the timestamp
      let context = contextLines.filter(Boolean).join(' ').trim();
      if (!context) {
        context = line.replace(fullMatch, '').replace(/^###\s*/, '').trim();
      }
      if (!context && imageFileName) {
        context = `Frame snapshot (${imageFileName})`;
      }
      if (!context) {
        context = `Timestamp at ${timePart}`;
      }

      timestamps.push({
        id: `ts-${seconds}-${i}`,
        raw: fullMatch,
        formattedTime: timePart,
        seconds,
        headerText: line.startsWith('###') ? line : undefined,
        context,
        imageFileName,
        line: i + 1,
      });
    }
  }

  // Sort chronologically by seconds for timeline navigation
  return timestamps.sort((a, b) => a.seconds - b.seconds);
}

/**
 * Returns the most recently appended/written timestamp in the markdown note (in document order),
 * rather than simply the highest numeric seconds value.
 */
export function getLastRecordedTimestamp(markdown: string): ParsedTimestamp | null {
  if (!markdown) return null;
  const { body } = extractFrontmatter(markdown);
  const lines = body.split(/\r?\n/);
  const timestampRegex = /(?:###\s+)?\[(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)\](?:\([^)]*\))?|(?:###\s+)(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)/g;
  let lastFound: ParsedTimestamp | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;
    timestampRegex.lastIndex = 0;

    while ((match = timestampRegex.exec(line)) !== null) {
      const fullMatch = match[0];
      const hh = match[1] || match[4];
      const mm = match[2] || match[5];
      const ss = match[3] || match[6];
      const timePart = (hh ? `${hh}:` : '') + `${mm.padStart(2, '0')}:${ss}`;
      const seconds = parseTimeStringToSeconds(timePart);

      lastFound = {
        id: `ts-${seconds}-${i}`,
        raw: fullMatch,
        formattedTime: timePart,
        seconds,
        headerText: line.startsWith('###') ? line : undefined,
        context: line.replace(fullMatch, '').replace(/^###\s*/, '').trim() || `Timestamp at ${timePart}`,
        line: i + 1,
      };
    }
  }

  return lastFound;
}

/**
 * Extracts all ![[attachment.webp]] references from markdown.
 */
export function parseFramesFromMarkdown(markdown: string): string[] {
  if (!markdown) return [];
  const matches = markdown.matchAll(/!\[\[(.*?)\]\]/g);
  const fileNames = new Set<string>();
  for (const m of matches) {
    if (m[1]) fileNames.add(m[1].trim());
  }
  return Array.from(fileNames);
}

interface MarkdownBlock {
  type: 'timestamp' | 'section' | 'text';
  seconds?: number;
  formattedTime?: string;
  imageFileName?: string;
  content: string;
}

function parseMarkdownIntoBlocks(body: string): MarkdownBlock[] {
  const lines = body.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let currentBlock: string[] = [];
  let currentType: 'timestamp' | 'section' | 'text' = 'text';
  let currentSeconds: number | undefined;
  let currentFormattedTime: string | undefined;
  let currentImg: string | undefined;

  function commitBlock() {
    if (currentBlock.length === 0) return;
    const content = currentBlock.join('\n').trim();
    if (content) {
      blocks.push({
        type: currentType,
        seconds: currentSeconds,
        formattedTime: currentFormattedTime,
        imageFileName: currentImg,
        content,
      });
    }
    currentBlock = [];
    currentType = 'text';
    currentSeconds = undefined;
    currentFormattedTime = undefined;
    currentImg = undefined;
  }

  for (const line of lines) {
    // Check if line is a timestamp header: e.g. "### [01:23]" or "### [01:23](...)"
    const tsMatch = line.match(/^###\s+\[(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)\](?:\([^)]*\))?|^###\s+(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)/);
    const headerMatch = line.match(/^#{1,2}\s+(.*)/);

    if (tsMatch) {
      commitBlock();
      currentType = 'timestamp';
      const hh = tsMatch[1] || tsMatch[4];
      const mm = tsMatch[2] || tsMatch[5];
      const ss = tsMatch[3] || tsMatch[6];
      const timePart = (hh ? `${hh}:` : '') + `${mm.padStart(2, '0')}:${ss}`;
      currentFormattedTime = timePart;
      currentSeconds = parseTimeStringToSeconds(timePart);
      currentBlock.push(line);
    } else if (headerMatch) {
      commitBlock();
      currentType = 'section';
      currentBlock.push(line);
    } else {
      const imgMatch = line.match(/!\[\[(.*?)\]\]/);
      if (imgMatch && !currentImg) {
        currentImg = imgMatch[1];
      }
      currentBlock.push(line);
    }
  }

  commitBlock();
  return blocks;
}

/**
 * Intelligent non-destructive merge of existing vault markdown and newly incoming editor markdown.
 * Guarantees zero data loss, preserves frontmatter, and avoids duplicating timestamps or images.
 */
export function mergeMarkdownNotes(existingMarkdown: string, incomingMarkdown: string): string {
  const cleanExisting = (existingMarkdown || '').trim();
  const cleanIncoming = (incomingMarkdown || '').trim();

  // Trivial cases
  if (!cleanExisting) return cleanIncoming;
  if (!cleanIncoming) return cleanExisting;
  if (cleanExisting === cleanIncoming) return cleanExisting;

  const existingFm = extractFrontmatter(cleanExisting);
  const incomingFm = extractFrontmatter(cleanIncoming);

  // If incoming already contains all of existing, user was working on the full document
  if (incomingFm.body.trim().includes(existingFm.body.trim())) {
    // Build updated frontmatter preserving created date from existing
    const updatedFm = buildFrontmatter({
      title: incomingFm.title || existingFm.title,
      source: incomingFm.source || existingFm.source,
      created: existingFm.created || incomingFm.created,
      updated: new Date().toISOString(),
      tags: Array.from(new Set([...(existingFm.tags || []), ...(incomingFm.tags || [])])),
    });
    return updatedFm + incomingFm.body.trim();
  }

  // If existing already contains all of incoming, nothing new to add
  if (existingFm.body.trim().includes(incomingFm.body.trim())) {
    return cleanExisting;
  }

  // Parse both bodies into structural blocks
  const existingBlocks = parseMarkdownIntoBlocks(existingFm.body);
  const incomingBlocks = parseMarkdownIntoBlocks(incomingFm.body);

  const mergedBlocks = [...existingBlocks];

  // Index existing blocks by seconds, imageFileName, and normalized content
  const existingTimes = new Set<number>();
  const existingImages = new Set<string>();
  const existingContents = new Set<string>();

  for (const b of existingBlocks) {
    if (b.seconds !== undefined) existingTimes.add(b.seconds);
    if (b.imageFileName) existingImages.add(b.imageFileName);
    existingContents.add(b.content.replace(/\s+/g, ' ').trim());
  }

  for (const inBlock of incomingBlocks) {
    const normContent = inBlock.content.replace(/\s+/g, ' ').trim();

    // 1. If this exact block is already in existing, skip (no duplicate)
    if (existingContents.has(normContent)) {
      continue;
    }

    // 2. If it's a timestamp block
    if (inBlock.seconds !== undefined) {
      if (existingTimes.has(inBlock.seconds)) {
        // Find existing timestamp block to see if we can augment it
        const target = mergedBlocks.find((b) => b.seconds === inBlock.seconds);
        if (target && !target.content.includes(inBlock.content)) {
          // If incoming has an AI callout, quote, or image embed, augment this block
          const extraLines = inBlock.content
            .split('\n')
            .filter((l) => {
              const trimmed = l.trim();
              if (!trimmed || trimmed.startsWith('###')) return false;
              if (target.content.includes(trimmed)) return false;
              // Only augment AI callouts, blockquotes, or image embeds
              return (
                trimmed.startsWith('> [!info]') ||
                trimmed.startsWith('>') ||
                trimmed.startsWith('![[')
              );
            });
          if (extraLines.length > 0) {
            target.content += '\n' + extraLines.join('\n');
          }
        }
      } else {
        // Brand new timestamp: insert in chronological order
        existingTimes.add(inBlock.seconds);
        let inserted = false;
        for (let i = 0; i < mergedBlocks.length; i++) {
          if (mergedBlocks[i].seconds !== undefined && mergedBlocks[i].seconds! > inBlock.seconds) {
            mergedBlocks.splice(i, 0, inBlock);
            inserted = true;
            break;
          }
        }
        if (!inserted) {
          mergedBlocks.push(inBlock);
        }
      }
    } else if (inBlock.imageFileName && existingImages.has(inBlock.imageFileName)) {
      // Image already exists, avoid duplicate insertion
      continue;
    } else if (inBlock.imageFileName) {
      // New image attachment that isn't in existing
      existingImages.add(inBlock.imageFileName);
      mergedBlocks.push(inBlock);
    } else if (inBlock.content.startsWith('> [!info]') || inBlock.content.startsWith('>')) {
      // AI callout or quote that isn't in existing
      mergedBlocks.push(inBlock);
    } else if (inBlock.type === 'section') {
      const headingMatch = inBlock.content.match(/^#{1,3}\s+(.*)/);
      const headingTitle = headingMatch ? headingMatch[1].trim() : '';
      const existsHeading = headingTitle && mergedBlocks.some((b) => b.content.includes(headingTitle));
      if (!existsHeading) {
        mergedBlocks.push(inBlock);
      }
    } else {
      // General prose or text block:
      // Only append if the existing note had no blocks at all.
      // Never re-append arbitrary text blocks that the user intentionally removed or altered in Obsidian.
      if (existingBlocks.length === 0) {
        mergedBlocks.push(inBlock);
      }
    }
  }

  const mergedBody = mergedBlocks.map((b) => b.content).join('\n\n');

  // Build combined frontmatter
  const finalFm = buildFrontmatter({
    title: existingFm.title || incomingFm.title,
    source: existingFm.source || incomingFm.source,
    created: existingFm.created || incomingFm.created,
    updated: new Date().toISOString(),
    tags: Array.from(new Set([...(existingFm.tags || []), ...(incomingFm.tags || [])])),
  });

  return (finalFm + mergedBody).trim() + '\n';
}
