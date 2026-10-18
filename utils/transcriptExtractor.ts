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
export function extractDeltaText(accumulatedText: string, incomingText: string): string {
  const cleanIncoming = incomingText.replace(/\s+/g, ' ').trim();
  const cleanAcc = accumulatedText.replace(/\s+/g, ' ').trim();

  if (!cleanAcc) return cleanIncoming;
  if (!cleanIncoming) return '';
  if (cleanIncoming === cleanAcc) return '';

  // 1. Direct prefix match: incoming starts with accumulated text
  if (cleanIncoming.startsWith(cleanAcc)) {
    const delta = cleanIncoming.substring(cleanAcc.length).replace(/^[\s,;.-]+/, '').trim();
    return delta;
  }

  // 2. Normalize words for fuzzy overlap check (handling punctuation and rolling window where older words fell off)
  const normalize = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

  const wordsIncoming = cleanIncoming.split(/\s+/);
  const wordsAcc = cleanAcc.split(/\s+/);

  const normIncoming = wordsIncoming.map(normalize);
  const normAcc = wordsAcc.map(normalize);

  // Check if incoming text is completely contained inside accumulated text
  const fullNormIncoming = normIncoming.filter(Boolean).join(' ');
  const fullNormAcc = normAcc.filter(Boolean).join(' ');
  if (fullNormAcc.endsWith(fullNormIncoming) || fullNormAcc.includes(fullNormIncoming)) {
    return '';
  }

  // Find longest suffix of normAcc matching prefix of normIncoming
  const maxCheck = Math.min(wordsIncoming.length, wordsAcc.length);
  for (let len = maxCheck; len >= 1; len--) {
    const sliceAcc = normAcc.slice(-len);
    const sliceInc = normIncoming.slice(0, len);

    let match = true;
    for (let i = 0; i < len; i++) {
      if (!sliceAcc[i] || !sliceInc[i] || sliceAcc[i] !== sliceInc[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      // The first `len` words of incoming were already in accumulated
      const remainingWords = wordsIncoming.slice(len);
      const delta = remainingWords.join(' ').replace(/^[\s,;.-]+/, '').trim();
      return delta;
    }
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
      if (video.textTracks[i].mode === 'disabled') {
        video.textTracks[i].mode = 'hidden';
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
