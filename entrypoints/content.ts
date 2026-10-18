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
      attachVideoTracking();
    });
    window.addEventListener('popstate', () => {
      lastTrackedVideo = null;
      attachVideoTracking();
    });
  },
});

let lastTrackedVideo: HTMLVideoElement | null = null;
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

  video.addEventListener('seeked', () => saveAndBroadcastVideoProgress(video, true));
  video.addEventListener('pause', () => saveAndBroadcastVideoProgress(video, true));
  video.addEventListener('play', () => saveAndBroadcastVideoProgress(video, true));
  video.addEventListener('timeupdate', () => saveAndBroadcastVideoProgress(video, false));

  // Initial broadcast
  saveAndBroadcastVideoProgress(video, true);
}

let captionObserver: MutationObserver | null = null;
let lastObservedCaption = '';
let activeCueListeners: Array<{ track: TextTrack; listener: () => void }> = [];

const CAPTION_SELECTOR = [
  // YouTube
  '.ytp-caption-segment',
  '.caption-window',
  // Canvas LMS & Video.js captions
  '.vjs-text-track-display',
  '.vjs-text-track-cue',
  '.vjs-text-track-cue div',
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

function startLiveCaptionObserver() {
  if (captionObserver) return;

  lastObservedCaption = '';
  captionObserver = new MutationObserver(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(CAPTION_SELECTOR));
    if (elements.length > 0) {
      let fullText = '';
      const specificCues = elements.filter((el) =>
        el.matches('.vjs-text-track-cue, .vjs-text-track-cue div, .ytp-caption-segment, [class*="cue"]')
      );
      if (specificCues.length > 0) {
        fullText = specificCues.map((s) => s.textContent || '').join(' ').trim();
      } else {
        fullText = elements.map((s) => s.textContent || '').join(' ').trim();
      }

      fullText = fullText.replace(/\s+/g, ' ').trim();

      if (fullText && fullText !== lastObservedCaption) {
        lastObservedCaption = fullText;
        const video = getActiveVideo();
        const time = video ? video.currentTime : 0;
        chrome.runtime.sendMessage({
          type: 'LIVE_WEB_CAPTION',
          text: fullText,
          timestamp: time,
          formattedTime: formatSeconds(time),
        }).catch(() => {});
      }
    }
  });

  captionObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  function hookTextTrack(track: TextTrack, video?: HTMLVideoElement) {
    const listener = () => {
      if (track.activeCues && track.activeCues.length > 0) {
        const cue = track.activeCues[0] as VTTCue;
        const text = (cue.text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (text && text !== lastObservedCaption) {
          lastObservedCaption = text;
          const time = cue.startTime || (video ? video.currentTime : 0);
          chrome.runtime.sendMessage({
            type: 'LIVE_WEB_CAPTION',
            text,
            timestamp: time,
            formattedTime: formatSeconds(time),
          }).catch(() => {});
        }
      }
    };
    track.addEventListener('cuechange', listener);
    activeCueListeners.push({ track, listener });
  }

  const video = getActiveVideo();
  if (video && video.textTracks) {
    for (let i = 0; i < video.textTracks.length; i++) {
      hookTextTrack(video.textTracks[i], video);
    }
    // Hook dynamically added tracks (Canvas loads tracks dynamically via network WebVTT)
    video.textTracks.addEventListener('addtrack', (e: TrackEvent) => {
      if (e.track) hookTextTrack(e.track as TextTrack, video);
    });
  }
}

function stopLiveCaptionObserver() {
  if (captionObserver) {
    captionObserver.disconnect();
    captionObserver = null;
  }
  for (const { track, listener } of activeCueListeners) {
    track.removeEventListener('cuechange', listener);
  }
  activeCueListeners = [];
}

