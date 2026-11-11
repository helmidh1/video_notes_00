import type { ExtensionMessage, FrameCaptureResponse, VideoStateResponse } from '../utils/messaging';
import { extractVideoTranscript, formatSeconds } from '../utils/transcriptExtractor';

function findAllVideos(root: Document | ShadowRoot = document): HTMLVideoElement[] {
  const videos: HTMLVideoElement[] = [];
  try {
    const list = root.querySelectorAll<HTMLVideoElement>('video');
    videos.push(...Array.from(list));

    const all = root.querySelectorAll('*');
    for (const el of Array.from(all)) {
      if (el.shadowRoot) {
        videos.push(...findAllVideos(el.shadowRoot));
      }
    }
  } catch {
    // Ignore DOM access errors
  }
  return videos;
}

function getActiveVideo(): HTMLVideoElement | undefined {
  // 1. YouTube: Always prioritize YouTube's primary player
  const ytMain = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (ytMain && !isNaN(ytMain.duration)) {
    return ytMain;
  }

  // 2. Canvas LMS / Video.js: Prioritize tech player
  const vjsTech = document.querySelector<HTMLVideoElement>('video.vjs-tech');
  if (vjsTech && !isNaN(vjsTech.duration)) {
    return vjsTech;
  }

  const allVideos = findAllVideos(document);
  if (allVideos.length === 0) return undefined;

  // 3. Actively playing video with meaningful area (> 15000 px² filters out tiny hover thumbnails)
  const playing = allVideos.find((v) => {
    if (v.paused || v.ended) return false;
    const r = v.getBoundingClientRect();
    return (r.width * r.height) > 15000;
  });
  if (playing) return playing;

  // 4. Video with largest rendered screen area and valid duration / readyState (filters out 160x90 thumbnails)
  let bestVideo: HTMLVideoElement | undefined;
  let maxArea = 0;
  for (const v of allVideos) {
    const r = v.getBoundingClientRect();
    const area = r.width * r.height;
    if ((v.duration > 0 || v.readyState >= 1) && area > maxArea) {
      maxArea = area;
      bestVideo = v;
    }
  }

  return bestVideo || allVideos[0];
}

function captureActiveVideoFrame(): FrameCaptureResponse {
  const video = getActiveVideo();

  if (!video) {
    return {
      ok: false,
      timestamp: 0,
      formattedTime: '00:00',
      error: 'No active HTML5 video element found on this page.',
    };
  }

  const rect = video.getBoundingClientRect();
  const videoRect = {
    x: Math.max(0, rect.left),
    y: Math.max(0, rect.top),
    width: rect.width,
    height: rect.height,
    devicePixelRatio: window.devicePixelRatio || 1,
  };

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      ok: false,
      timestamp: video.currentTime,
      formattedTime: formatSeconds(video.currentTime),
      error: 'Canvas 2D context is unavailable.',
    };
  }

  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/webp', 0.88);

    return {
      ok: true,
      timestamp: video.currentTime,
      formattedTime: formatSeconds(video.currentTime),
      dataUrl,
      pageTitle: document.title,
      pageUrl: window.location.href,
    };
  } catch (err) {
    // Canvas was tainted (cross-origin / protected stream). Return bounding box for background fallback capture.
    console.warn('Direct canvas draw tainted, requesting background visibleTab capture fallback:', err);
    return {
      ok: true,
      timestamp: video.currentTime,
      formattedTime: formatSeconds(video.currentTime),
      needsFallbackCapture: true,
      videoRect,
      pageTitle: document.title,
      pageUrl: window.location.href,
    };
  }
}

function getVideoState(): VideoStateResponse {
  const video = getActiveVideo();
  if (!video) {
    return {
      ok: false,
      currentTime: 0,
      duration: 0,
      paused: true,
      playbackRate: 1,
      formattedTime: '00:00',
      pageTitle: document.title,
      pageUrl: window.location.href,
      error: 'No video element found',
    };
  }

  return {
    ok: true,
    currentTime: video.currentTime,
    duration: video.duration || 0,
    paused: video.paused,
    playbackRate: video.playbackRate,
    formattedTime: formatSeconds(video.currentTime),
    pageTitle: document.title,
    pageUrl: window.location.href,
  };
}

export default defineContentScript({
  matches: ['*://*/*', 'file://*/*'],
  allFrames: true,
  matchAboutBlank: true,
  main() {
    chrome.runtime.onMessage.addListener(
      (message: ExtensionMessage, _sender, sendResponse) => {
        if (message.type === 'CAPTURE_VIDEO_FRAME') {
          const video = getActiveVideo();
          if (video) {
            sendResponse(captureActiveVideoFrame());
            return true;
          }
          return false;
        }

        if (message.type === 'GET_VIDEO_STATE') {
          const video = getActiveVideo();
          if (video) {
            sendResponse(getVideoState());
            return true;
          }
          // Do not sendResponse if this frame has no video element.
          // This allows the iframe holding the Canvas video to answer!
          return false;
        }

        if (message.type === 'EXTRACT_TRANSCRIPT') {
          const video = getActiveVideo();
          const transcript = extractVideoTranscript(video);
          if (transcript.ok || video) {
            sendResponse(transcript);
            return true;
          }
          return false;
        }

        if (message.type === 'SEEK_VIDEO') {
          const video = getActiveVideo();
          if (video) {
            video.currentTime = message.timestamp;
            sendResponse({ ok: true });
            return true;
          }
          return false;
        }

        if (message.type === 'TOGGLE_PLAY') {
          const video = getActiveVideo();
          if (video) {
            if (video.paused) {
              video.play().catch(() => {});
            } else {
              video.pause();
            }
            sendResponse({ ok: true, paused: video.paused });
            return true;
          }
          return false;
        }

        if (message.type === 'SET_PLAYBACK_RATE') {
          const video = getActiveVideo();
          if (video) {
            video.playbackRate = message.rate;
            sendResponse({ ok: true, rate: video.playbackRate });
            return true;
          }
          return false;
        }

        if (message.type === 'START_LIVE_CAPTIONS') {
          liveCaptionsEnabledBySidePanel = true;
          autoEnableCCPreference = message.autoEnableCC !== false;
          if (!autoEnableCCPreference && ccRetryTimer !== null) {
            clearTimeout(ccRetryTimer);
            ccRetryTimer = null;
          }
          startLiveCaptionObserver();
          sendResponse({ ok: true });
          return true;
        }

        if (message.type === 'STOP_LIVE_CAPTIONS') {
          stopLiveCaptionObserver();
          sendResponse({ ok: true });
          return true;
        }

        return false;
      }
    );

    // Start tracking active video playback, seek, and pause
    attachVideoTracking();

    const domObserver = new MutationObserver(() => {
      attachVideoTracking();
    });
    if (document.body) {
      domObserver.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener('yt-navigate-finish', () => {
      lastTrackedVideo = null;
      lastObservedDomCaption = '';
      lastObservedCueKey = '';
      attachVideoTracking();
      if (liveCaptionsEnabledBySidePanel) {
        startLiveCaptionObserver();
      }
    });
    window.addEventListener('popstate', () => {
      lastTrackedVideo = null;
      lastObservedDomCaption = '';
      lastObservedCueKey = '';
      attachVideoTracking();
      if (liveCaptionsEnabledBySidePanel) {
        startLiveCaptionObserver();
      }
    });
  },
});

let lastTrackedVideo: HTMLVideoElement | null = null;
const trackedPlaybackVideos = new WeakSet<HTMLVideoElement>();
let lastBroadcastTime = -1;

function saveAndBroadcastVideoProgress(video: HTMLVideoElement, force = false) {
  if (!video || isNaN(video.currentTime)) return;
  const current = Math.floor(video.currentTime);
  if (!force && Math.abs(current - lastBroadcastTime) < 1) return;
  lastBroadcastTime = current;

  const formattedTime = formatSeconds(video.currentTime);
  const cleanUrl = window.location.href.split('#')[0].replace(/[?&]t=\d+s?/, '');
  const storageKey = 'video_pos_' + cleanUrl;

  const payload = {
    currentTime: video.currentTime,
    formattedTime,
    duration: video.duration || 0,
    paused: video.paused,
    updatedAt: Date.now(),
    pageTitle: document.title,
    pageUrl: window.location.href,
  };

  // 1. Store in chrome.storage.local for persistence across reloads / coming back later
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ [storageKey]: payload }).catch(() => {});
  }

  // 2. Broadcast to extension sidepanel
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      type: 'VIDEO_TIME_UPDATE',
      ...payload,
    }).catch(() => {});
  }
}

function attachVideoTracking() {
  const video = getActiveVideo();
  if (!video || video === lastTrackedVideo) return;
  lastTrackedVideo = video;

  if (!trackedPlaybackVideos.has(video)) {
    trackedPlaybackVideos.add(video);
    video.addEventListener('seeked', () => saveAndBroadcastVideoProgress(video, true));
    video.addEventListener('pause', () => saveAndBroadcastVideoProgress(video, true));
    video.addEventListener('play', () => saveAndBroadcastVideoProgress(video, true));
    video.addEventListener('timeupdate', () => saveAndBroadcastVideoProgress(video, false));
  }

  // Initial broadcast
  saveAndBroadcastVideoProgress(video, true);

  // Only attach/re-attach live caption observation if the side panel enabled it
  if (liveCaptionsEnabledBySidePanel) {
    startLiveCaptionObserver();
  }
}

let liveCaptionsEnabledBySidePanel = false;
let autoEnableCCPreference = true;
let captionObserver: MutationObserver | null = null;
let lastCaptionVideo: HTMLVideoElement | null = null;
let lastObservedDomCaption = '';
let lastObservedCueKey = '';
let activeCueListeners: Array<{ track: TextTrack; listener: () => void }> = [];
let activeTrackListListeners: Array<{ list: TextTrackList; type: 'addtrack' | 'change'; listener: EventListener }> = [];
const autoEnabledYouTubeUrls = new Set<string>();
const retriedYouTubeCCUrls = new Set<string>();
let ccRetryTimer: ReturnType<typeof setTimeout> | null = null;

const CAPTION_SELECTOR = [
  // YouTube
  '.ytp-caption-segment',
  '.caption-window',
  // Canvas LMS & Video.js captions
  '.vjs-text-track-display',
  '.vjs-text-track-cue',
  '[class*="vjs-text-track"]',
  // Canvas Studio / Instructure Media
  '[class*="studio-caption"]',
  '[class*="captions-container"]',
  '[class*="captions-display"]',
  '[class*="caption-cue"]',
  '[class*="caption-window"]',
  // Kaltura / Panopto / Generic LMS
  '.kaltura-player-captions',
  '[class*="event-tab-content"]',
  'div[aria-live="polite"][class*="caption"]',
  'div[aria-live="polite"][class*="subtitle"]',
  'div[class*="caption-text"]',
  'span[class*="caption-text"]',
].join(', ');

function getCleanVideoUrlKey(): string {
  try {
    const u = new URL(window.location.href);
    u.hash = '';
    u.searchParams.delete('t');
    return u.toString();
  } catch {
    return window.location.href.split('#')[0].replace(/[?&]t=\d+s?/, '');
  }
}

function autoEnableYouTubeSubtitles() {
  if (!window.location.hostname.includes('youtube.com')) return;
  if (!liveCaptionsEnabledBySidePanel || !autoEnableCCPreference) return;

  const urlKey = getCleanVideoUrlKey();
  if (autoEnabledYouTubeUrls.has(urlKey)) return;

  try {
    const ccBtn = document.querySelector<HTMLButtonElement>('.ytp-subtitles-button');
    if (!ccBtn) {
      if (!retriedYouTubeCCUrls.has(urlKey) && ccRetryTimer === null) {
        retriedYouTubeCCUrls.add(urlKey);
        ccRetryTimer = setTimeout(() => {
          ccRetryTimer = null;
          if (!liveCaptionsEnabledBySidePanel || !autoEnableCCPreference) return;
          if (getCleanVideoUrlKey() !== urlKey) return;
          const retryBtn = document.querySelector<HTMLButtonElement>('.ytp-subtitles-button');
          autoEnabledYouTubeUrls.add(urlKey);
          if (
            retryBtn &&
            !retryBtn.disabled &&
            retryBtn.getAttribute('aria-disabled') !== 'true' &&
            retryBtn.getAttribute('aria-pressed') !== 'true'
          ) {
            retryBtn.click();
          }
        }, 750);
      }
      return;
    }

    if (ccRetryTimer !== null) {
      clearTimeout(ccRetryTimer);
      ccRetryTimer = null;
    }
    autoEnabledYouTubeUrls.add(urlKey);

    if (ccBtn.disabled || ccBtn.getAttribute('aria-disabled') === 'true') {
      return;
    }
    if (ccBtn.getAttribute('aria-pressed') !== 'true') {
      ccBtn.click();
    }
  } catch {
    // Ignore DOM interaction errors
  }
}

function selectPreferredCaptionTrack(tracks: TextTrackList): TextTrack | null {
  const candidates: TextTrack[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (t.kind === 'captions' || t.kind === 'subtitles') {
      candidates.push(t);
    }
  }
  if (candidates.length === 0) return null;

  const showing = candidates.find((t) => t.mode === 'showing');
  if (showing) return showing;

  const browserLang = (navigator.language || 'en').toLowerCase();
  const baseLang = browserLang.split('-')[0];

  const exactLang = candidates.find((t) => t.language && t.language.toLowerCase() === browserLang);
  if (exactLang) return exactLang;

  const baseLangMatch = candidates.find(
    (t) => t.language && t.language.toLowerCase().split('-')[0] === baseLang
  );
  if (baseLangMatch) return baseLangMatch;

  const hidden = candidates.find((t) => t.mode === 'hidden');
  if (hidden) return hidden;

  return candidates.find((t) => t.kind === 'captions') || candidates[0];
}

function clearCueListeners() {
  for (const { track, listener } of activeCueListeners) {
    track.removeEventListener('cuechange', listener);
  }
  activeCueListeners = [];
}

function clearTrackListListeners() {
  for (const { list, type, listener } of activeTrackListListeners) {
    list.removeEventListener(type, listener);
  }
  activeTrackListListeners = [];
}

function hookTextTrack(track: TextTrack, video?: HTMLVideoElement) {
  if (track.mode === 'disabled') {
    try {
      track.mode = 'hidden';
    } catch {
      // Ignored
    }
  }
  const listener = () => {
    if (track.activeCues && track.activeCues.length > 0) {
      const parts: string[] = [];
      for (let i = 0; i < track.activeCues.length; i++) {
        const cue = track.activeCues[i] as VTTCue;
        const cleaned = (cue.text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (cleaned) parts.push(cleaned);
      }
      const text = parts.join(' ').replace(/\s+/g, ' ').trim();
      const firstCue = track.activeCues[0] as VTTCue;
      const time =
        typeof firstCue?.startTime === 'number' && !isNaN(firstCue.startTime)
          ? firstCue.startTime
          : (video ? video.currentTime : 0);
      const cueKey = `${Math.round(time * 100)}:${text}`;

      if (text && cueKey !== lastObservedCueKey) {
        lastObservedCueKey = cueKey;
        chrome.runtime.sendMessage({
          type: 'LIVE_WEB_CAPTION',
          text,
          timestamp: time,
          formattedTime: formatSeconds(time),
        }).catch(() => {});
      }
    } else {
      lastObservedCueKey = '';
    }
  };
  track.addEventListener('cuechange', listener);
  activeCueListeners.push({ track, listener });
}

function syncBestTextTrack(video: HTMLVideoElement) {
  if (!video || !video.textTracks) return;
  const bestTrack = selectPreferredCaptionTrack(video.textTracks);
  if (!bestTrack) {
    clearCueListeners();
    return;
  }

  if (activeCueListeners.length === 1 && activeCueListeners[0].track === bestTrack) {
    if (bestTrack.mode === 'disabled') {
      try {
        bestTrack.mode = 'hidden';
      } catch {
        // Ignored
      }
    }
    return;
  }

  clearCueListeners();
  hookTextTrack(bestTrack, video);
}

function attachTextTracksForVideo(video: HTMLVideoElement | undefined) {
  if (!video || !video.textTracks) return;

  if (video !== lastCaptionVideo) {
    clearCueListeners();
    clearTrackListListeners();
    lastCaptionVideo = video;
    lastObservedCueKey = '';

    const onTrackChange = () => {
      if (liveCaptionsEnabledBySidePanel) {
        syncBestTextTrack(video);
      }
    };
    video.textTracks.addEventListener('addtrack', onTrackChange);
    video.textTracks.addEventListener('change', onTrackChange);
    activeTrackListListeners.push(
      { list: video.textTracks, type: 'addtrack', listener: onTrackChange },
      { list: video.textTracks, type: 'change', listener: onTrackChange }
    );
  }

  syncBestTextTrack(video);
}

function startLiveCaptionObserver() {
  // Always ensure YouTube CC (at most once per URL when autoEnableCC !== false) and video TextTrack hooks are synced
  autoEnableYouTubeSubtitles();
  attachTextTracksForVideo(getActiveVideo());

  if (captionObserver) return;

  lastObservedDomCaption = '';
  captionObserver = new MutationObserver(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(CAPTION_SELECTOR));
    if (elements.length > 0) {
      const specificCues = elements.filter((el) =>
        el.matches('.vjs-text-track-cue, .ytp-caption-segment, [class*="cue"]')
      );
      const candidates = specificCues.length > 0 ? specificCues : elements;
      // Keep only deepest/leaf matched nodes to avoid parent+child double scraping
      const leafElements = candidates.filter(
        (el) => !candidates.some((other) => other !== el && el.contains(other))
      );

      const fullText = leafElements
        .map((s) => s.textContent || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (fullText) {
        if (fullText !== lastObservedDomCaption) {
          lastObservedDomCaption = fullText;
          const video = getActiveVideo();
          const time = video ? video.currentTime : 0;
          chrome.runtime.sendMessage({
            type: 'LIVE_WEB_CAPTION',
            text: fullText,
            timestamp: time,
            formattedTime: formatSeconds(time),
          }).catch(() => {});
        }
      } else {
        lastObservedDomCaption = '';
      }
    } else {
      lastObservedDomCaption = '';
    }
  });

  if (document.body) {
    captionObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
}

function stopLiveCaptionObserver() {
  liveCaptionsEnabledBySidePanel = false;
  if (ccRetryTimer !== null) {
    clearTimeout(ccRetryTimer);
    ccRetryTimer = null;
  }
  if (captionObserver) {
    captionObserver.disconnect();
    captionObserver = null;
  }
  clearCueListeners();
  clearTrackListListeners();
  lastCaptionVideo = null;
  lastObservedDomCaption = '';
  lastObservedCueKey = '';
}

