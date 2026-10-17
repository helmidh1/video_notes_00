import type { ExtensionMessage, FrameCaptureResponse, VideoStateResponse } from '../utils/messaging';
import { extractVideoTranscript, formatSeconds } from '../utils/transcriptExtractor';

function getActiveVideo(): HTMLVideoElement | undefined {
  // Query all video elements including common player containers
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));

  // Prioritize currently playing video
  const playing = videos.find((v) => !v.paused && v.currentTime > 0 && !v.ended);
  if (playing) return playing;

  // Next, prioritize video with valid dimensions and readyState
  const ready = videos.find((v) => v.readyState >= 2 && v.videoWidth > 0);
  if (ready) return ready;

  return videos[0];
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
  main() {
    chrome.runtime.onMessage.addListener(
      (message: ExtensionMessage, _sender, sendResponse) => {
        if (message.type === 'CAPTURE_VIDEO_FRAME') {
          sendResponse(captureActiveVideoFrame());
          return true;
        }

        if (message.type === 'GET_VIDEO_STATE') {
          sendResponse(getVideoState());
          return true;
        }

        if (message.type === 'EXTRACT_TRANSCRIPT') {
          const video = getActiveVideo();
          sendResponse(extractVideoTranscript(video));
          return true;
        }

        if (message.type === 'SEEK_VIDEO') {
          const video = getActiveVideo();
          if (video) {
            video.currentTime = message.timestamp;
            sendResponse({ ok: true });
          } else {
            sendResponse({ ok: false, error: 'No video found to seek.' });
          }
          return true;
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
          } else {
            sendResponse({ ok: false, error: 'No video found.' });
          }
          return true;
        }

        if (message.type === 'SET_PLAYBACK_RATE') {
          const video = getActiveVideo();
          if (video) {
            video.playbackRate = message.rate;
            sendResponse({ ok: true, rate: video.playbackRate });
          } else {
            sendResponse({ ok: false, error: 'No video found.' });
          }
          return true;
        }

        return false;
      }
    );
  },
});
