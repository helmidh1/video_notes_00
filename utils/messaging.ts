export type ExtensionMessage =
  | { type: 'CAPTURE_VIDEO_FRAME' }
  | { type: 'GET_VIDEO_STATE' }
  | { type: 'SEEK_VIDEO'; timestamp: number }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_PLAYBACK_RATE'; rate: number }
  | { type: 'EXTRACT_TRANSCRIPT' }
  | { type: 'HOTKEY_COMMAND'; command: string };

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
