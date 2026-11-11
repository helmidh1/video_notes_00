import type { TranscriptResponse, TranscriptSegment } from './messaging';

export function formatSeconds(secondsInput: number): string {
  const totalSeconds = Math.floor(secondsInput);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

export function parseTimeStringToSeconds(timeStr: string): number {
  const parts = timeStr.trim().split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

/**
 * Given the previously accumulated text and a new text chunk from a rolling caption window,
 * extracts ONLY the newly added delta/suffix without duplicating prior text.
 */
function tokensStemMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 2 && longer.startsWith(shorter)) {
    return true;
  }
  if (shorter.length >= 4) {
    let common = 0;
    const minLen = shorter.length;
    while (common < minLen && a[common] === b[common]) {
      common++;
    }
    if (common >= 4) {
      return true;
    }
  }
  return false;
}

function tokensSliceEqual(
  arrA: string[],
  startA: number,
  arrB: string[],
  startB: number,
  len: number
): boolean {
  for (let i = 0; i < len; i++) {
    if (arrA[startA + i] !== arrB[startB + i]) {
      return false;
    }
  }
  return true;
}

function hasAlignedPrefixContext(
  accBefore: string[],
  incBefore: string[],
  anchorLen: number
): boolean {
  if (incBefore.length === 0) return true;

  if (incBefore.length >= 4) {
    if (accBefore.length < 2) return false;
    const accBigrams = new Set<string>();
    for (let i = 0; i < accBefore.length - 1; i++) {
      accBigrams.add(`${accBefore[i]}\u0000${accBefore[i + 1]}`);
    }
    const totalBigrams = incBefore.length - 1;
    let bigramHits = 0;
    for (let i = 0; i < totalBigrams; i++) {
      if (accBigrams.has(`${incBefore[i]}\u0000${incBefore[i + 1]}`)) {
        bigramHits++;
      }
    }
    if (anchorLen === 2) {
      return bigramHits >= 5 && bigramHits / totalBigrams >= 0.6;
    }
    if (anchorLen >= 8 && bigramHits >= 2) {
      return true;
    }
    return bigramHits >= 2 && bigramHits / totalBigrams >= 0.3;
  }

  if (accBefore.length === 0 || anchorLen < 3) return false;
  const recentTail = new Set(accBefore.slice(-10));
  let recentHits = 0;
  for (const tok of incBefore) {
    if (recentTail.has(tok)) recentHits++;
  }
  if (anchorLen >= 6 && recentHits >= 1) return true;
  const required = incBefore.length === 1 ? 1 : 2;
  return recentHits >= required;
}

function findTailAnchorEndIdx(overlapWindowAcc: string[], normInc: string[]): number | null {
  const accLen = overlapWindowAcc.length;
  const incLen = normInc.length;
  if (accLen < 2 || incLen < 2) return null;

  // Pass 1 (skip === 0): prefer strong head scroll-off (pos === 0, len >= 3)
  const maxHead = Math.min(incLen, accLen);
  for (let len = maxHead; len >= 3; len--) {
    if (tokensSliceEqual(overlapWindowAcc, accLen - len, normInc, 0, len)) {
      return len - 1;
    }
  }

  // Pass 2 (skip === 0, pos > 0): bubble head stayed visible while earlier words/commas changed
  const maxInner = Math.min(incLen, accLen, 40);
  for (let len = maxInner; len >= 2; len--) {
    const suffixStart = accLen - len;
    for (let pos = incLen - len; pos >= 1; pos--) {
      if (
        tokensSliceEqual(overlapWindowAcc, suffixStart, normInc, pos, len) &&
        hasAlignedPrefixContext(overlapWindowAcc.slice(0, suffixStart), normInc.slice(0, pos), len)
      ) {
        return pos + len - 1;
      }
    }
  }

  // Pass 3 (skip === 0, pos === 0, len === 2): two-word rolling boundary fallback
  if (tokensSliceEqual(overlapWindowAcc, accLen - 2, normInc, 0, 2)) {
    return 1;
  }

  // Pass 4 (skip in [1, 2]): minor ASR revision right at trailing seam (e.g. "node it" -> "node itself")
  for (const skip of [1, 2]) {
    if (accLen < skip + 3) continue;
    const maxSeam = Math.min(incLen, accLen - skip, 40);
    const skippedTokens = overlapWindowAcc.slice(accLen - skip);
    const accPrefixBase = accLen - skip;
    for (let len = maxSeam; len >= 3; len--) {
      const suffixStart = accPrefixBase - len;
      for (let pos = incLen - len; pos >= 0; pos--) {
        if (!tokensSliceEqual(overlapWindowAcc, suffixStart, normInc, pos, len)) {
          continue;
        }
        const nextPos = pos + len;
        if (pos === 0) {
          const hasSeamStem =
            nextPos < incLen && skippedTokens.some((s) => tokensStemMatch(normInc[nextPos], s));
          if (len < 4 && !(skip === 1 && hasSeamStem)) {
            continue;
          }
        } else if (
          !hasAlignedPrefixContext(
            overlapWindowAcc.slice(0, suffixStart),
            normInc.slice(0, pos),
            len
          )
        ) {
          continue;
        }

        let endIdx = pos + len - 1;
        if (nextPos < incLen) {
          const nextTok = normInc[nextPos];
          if (
            (skippedTokens.length === 2 && skippedTokens.join('') === nextTok) ||
            skippedTokens.some((s) => tokensStemMatch(nextTok, s))
          ) {
            endIdx = nextPos;
          }
        }
        return endIdx;
      }
    }
  }

  return null;
}

export function extractDeltaText(accumulatedText: string, incomingText: string): string {
  const cleanIncoming = incomingText.replace(/\s+/g, ' ').trim();
  const cleanAcc = accumulatedText.replace(/\s+/g, ' ').trim();

  if (!cleanAcc) return cleanIncoming;
  if (!cleanIncoming) return '';
  if (cleanIncoming === cleanAcc) return '';

  const leadingPunctRegex = /^[\s,;.?!:—-]+/;

  // 1. Word-boundary direct prefix match: incoming starts with accumulated text
  if (cleanIncoming.startsWith(cleanAcc)) {
    const nextChar = cleanIncoming[cleanAcc.length];
    const endsWithBoundaryPunct = /[\s,.;:!?—]$/.test(cleanAcc);
    const nextIsBoundary = nextChar !== undefined && !/[a-zA-Z0-9''’_-]/.test(nextChar);
    if (endsWithBoundaryPunct || nextIsBoundary) {
      return cleanIncoming.substring(cleanAcc.length).replace(leadingPunctRegex, '').trim();
    }
  }

  // 2. Normalize words for fuzzy overlap check (handling punctuation and rolling window where older words fell off)
  const normalize = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

  const wordsIncoming = cleanIncoming.split(/\s+/);
  const wordsAcc = cleanAcc.split(/\s+/);

  const normAccTokens = wordsAcc.map(normalize).filter(Boolean);
  const incTokens = wordsIncoming
    .map((word, idx) => ({ norm: normalize(word), idx }))
    .filter((t) => t.norm.length > 0);

  if (incTokens.length === 0) {
    return '';
  }

  const normInc = incTokens.map((t) => t.norm);

  const sliceAfterToken = (endTokIdx: number): string => {
    if (endTokIdx + 1 >= incTokens.length) {
      return '';
    }
    const startWordIdx = incTokens[endTokIdx].idx + 1;
    return wordsIncoming.slice(startWordIdx).join(' ').replace(leadingPunctRegex, '').trim();
  };

  // 1b. Normalized token prefix match (handles comma/period edits in already-committed text)
  if (normAccTokens.length >= 2 && normAccTokens.length <= normInc.length) {
    if (tokensSliceEqual(normInc, 0, normAccTokens, 0, normAccTokens.length)) {
      return sliceAfterToken(normAccTokens.length - 1);
    }
  }

  const recentAcc = normAccTokens.slice(-50);

  // Check if incoming token sequence is contained inside recent accumulated tokens
  if (normInc.length >= 2) {
    for (let start = 0; start <= recentAcc.length - normInc.length; start++) {
      let allMatch = true;
      for (let j = 0; j < normInc.length; j++) {
        if (recentAcc[start + j] !== normInc[j]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        return '';
      }
    }
  } else if (recentAcc.length > 0 && recentAcc[recentAcc.length - 1] === normInc[0]) {
    // Only suppress single-token repeat if it mirrors the immediate trailing token without a new unpunctuated sentence start
    const accLower = cleanAcc.toLowerCase();
    const incLower = cleanIncoming.toLowerCase();
    if (accLower.endsWith(incLower) || !/[.?!]$/.test(cleanAcc)) {
      return '';
    }
  }

  // Tail-anchor overlap alignment across both head-scrolled and un-scrolled rolling bubbles
  const overlapWindowAcc = normAccTokens.slice(-150);
  const endTokIdx = findTailAnchorEndIdx(overlapWindowAcc, normInc);
  if (endTokIdx !== null) {
    return sliceAfterToken(endTokIdx);
  }

  // No overlap found (e.g. after a long pause or topic change)
  return cleanIncoming;
}

function extractFromTextTracks(video: HTMLVideoElement): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const tracks = Array.from(video.textTracks || []);

  const targetTrack =
    tracks.find((t) => (t.kind === 'captions' || t.kind === 'subtitles') && t.cues && t.cues.length > 0) ||
    tracks.find((t) => t.cues && t.cues.length > 0);

  if (!targetTrack || !targetTrack.cues) {
    return segments;
  }

  for (let i = 0; i < targetTrack.cues.length; i++) {
    const cue = targetTrack.cues[i] as VTTCue;
    const cleanText = (cue.text || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanText) {
      segments.push({
        startTime: cue.startTime,
        formattedTime: formatSeconds(cue.startTime),
        text: cleanText,
      });
    }
  }

  return segments;
}

function extractFromYouTubeDOM(): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const rendererNodes = Array.from(
    document.querySelectorAll('ytd-transcript-segment-renderer')
  );

  for (const node of rendererNodes) {
    const timeEl = node.querySelector('.segment-timestamp');
    const textEl = node.querySelector('.segment-text');

    const rawTime = timeEl?.textContent?.trim() || '00:00';
    const cleanText = textEl?.textContent?.replace(/\s+/g, ' ').trim() || '';

    if (cleanText) {
      const startTime = parseTimeStringToSeconds(rawTime);
      segments.push({
        startTime,
        formattedTime: formatSeconds(startTime),
        text: cleanText,
      });
    }
  }

  return segments;
}

function extractFromCanvasDOM(): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  // 1. Check Canvas Studio / Video.js transcript drawer or list
  const items = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[class*="transcript-item"], [class*="transcript-line"], .transcript-content li, [data-testid*="transcript-line"], .vjs-transcription-item, [class*="studio-transcript"] tr, [class*="studio-transcript"] li'
    )
  );

  for (const item of items) {
    const timeEl = item.querySelector('[class*="time"], [class*="timestamp"], button, .timestamp');
    const textEl = item.querySelector('[class*="text"], [class*="cue"], [class*="content"]') || item;

    const rawTime = timeEl?.textContent?.trim() || '';
    let cleanText = textEl?.textContent?.replace(/\s+/g, ' ').trim() || '';

    if (rawTime && cleanText.startsWith(rawTime)) {
      cleanText = cleanText.substring(rawTime.length).trim();
    }

    if (cleanText) {
      const startTime = parseTimeStringToSeconds(rawTime);
      segments.push({
        startTime,
        formattedTime: formatSeconds(startTime),
        text: cleanText,
      });
    }
  }

  // 2. Check active Video.js text track cue overlays in DOM
  if (segments.length === 0) {
    const cues = Array.from(document.querySelectorAll<HTMLElement>('.vjs-text-track-cue, [class*="vjs-text-track-display"] div'));
    for (const cue of cues) {
      const text = cue.textContent?.replace(/\s+/g, ' ').trim();
      if (text && !segments.some((s) => s.text === text)) {
        segments.push({
          startTime: 0,
          formattedTime: '00:00',
          text,
        });
      }
    }
  }

  return segments;
}

// Attempt to trigger opening the transcript drawer on YouTube if currently closed
function attemptOpenYouTubeTranscript(): void {
  // Try finding the transcript button in the description section
  const transcriptBtn = document.querySelector<HTMLButtonElement>(
    'button[aria-label*="transcript" i], ytd-video-description-transcript-section-renderer button, button[aria-label*="Show transcript" i]'
  );
  if (transcriptBtn) {
    transcriptBtn.click();
  }
}

export function extractVideoTranscript(video?: HTMLVideoElement): TranscriptResponse {
  let segments: TranscriptSegment[] = [];

  if (video && video.textTracks) {
    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      if ((track.kind === 'captions' || track.kind === 'subtitles') && track.mode === 'disabled') {
        track.mode = 'hidden';
      }
    }
    segments = extractFromTextTracks(video);
  }

  if (segments.length === 0) {
    segments = extractFromYouTubeDOM();
  }

  if (segments.length === 0) {
    segments = extractFromCanvasDOM();
  }

  if (segments.length === 0) {
    // Attempt opening drawer once for subsequent extraction
    attemptOpenYouTubeTranscript();
    return {
      ok: false,
      segments: [],
      error:
        'No captions found. Please ensure closed captions (CC) are enabled or the video transcript drawer is open, then try again.',
    };
  }

  return {
    ok: true,
    segments,
    pageTitle: document.title,
    pageUrl: window.location.href,
  };
}
