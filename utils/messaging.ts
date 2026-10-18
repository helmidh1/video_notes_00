export type ExtensionMessage =
  | { type: 'CAPTURE_VIDEO_FRAME' }
  | { type: 'GET_VIDEO_STATE' }
  | { type: 'SEEK_VIDEO'; timestamp: number }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_PLAYBACK_RATE'; rate: number }
  | { type: 'EXTRACT_TRANSCRIPT' }
  | { type: 'START_LIVE_CAPTIONS' }
  | { type: 'STOP_LIVE_CAPTIONS' }
  | {
      type: 'LIVE_WEB_CAPTION';
      text: string;
      timestamp: number;
      formattedTime: string;
      pageUrl?: string;
      canonicalUrl?: string;
      sessionKey?: string;
      tabId?: number;
    }
  | {
      type: 'VIDEO_TIME_UPDATE';
      currentTime: number;
      formattedTime: string;
      duration: number;
      paused?: boolean;
      pageUrl?: string;
      canonicalUrl?: string;
      sessionKey?: string;
      pageTitle?: string;
      tabId?: number;
    }
  | { type: 'HOTKEY_COMMAND'; command: string }
  | { type: 'ACTIVE_TAB_CHANGED'; tabId: number; url: string; title: string; sessionKey: string }
  | { type: 'AUDIBLE_TAB_CHANGED'; tabId: number; audible: boolean; sessionKey?: string };

export interface LiveCaptionItem {
  id: string;
  text: string;
  timestamp: number;
  formattedTime: string;
  isFinal: boolean;
  source: 'chrome-live-caption' | 'windows-live-caption' | 'web-caption';
}

export interface VideoStateResponse {
  ok: boolean;
  currentTime: number;
  duration: number;
  paused: boolean;
  playbackRate: number;
  formattedTime: string;
  pageTitle: string;
  pageUrl: string;
  error?: string;
}

export interface VideoBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface FrameCaptureResponse {
  ok: boolean;
  timestamp: number;
  formattedTime: string;
  dataUrl?: string;
  pageTitle?: string;
  pageUrl?: string;
  needsFallbackCapture?: boolean;
  videoRect?: VideoBoundingBox;
  error?: string;
}

export interface TranscriptSegment {
  startTime: number;
  formattedTime: string;
  text: string;
}

export interface TranscriptResponse {
  ok: boolean;
  segments: TranscriptSegment[];
  pageTitle?: string;
  pageUrl?: string;
  error?: string;
}
