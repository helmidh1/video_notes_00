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
