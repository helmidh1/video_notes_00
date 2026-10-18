import { describe, it, expect } from 'vitest';
import {
  normalizeSessionUrl,
  sanitizeFileName,
  createDefaultSession,
} from '../utils/sessionManager';

describe('sessionManager - normalizeSessionUrl', () => {
  it('canonicalizes standard YouTube watch URLs', () => {
    const raw = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const { canonicalUrl, sessionKey } = normalizeSessionUrl(raw);
    expect(canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(sessionKey).toBe('yt_dQw4w9WgXcQ');
  });

  it('strips YouTube timestamps, tracking parameters, and hash fragments', () => {
    const raw =
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s&feature=share&si=test1234#section';
    const { canonicalUrl, sessionKey } = normalizeSessionUrl(raw);
    expect(canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(sessionKey).toBe('yt_dQw4w9WgXcQ');
  });

  it('canonicalizes youtu.be shortlinks', () => {
    const raw = 'https://youtu.be/dQw4w9WgXcQ?t=45s';
    const { canonicalUrl, sessionKey } = normalizeSessionUrl(raw);
    expect(canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(sessionKey).toBe('yt_dQw4w9WgXcQ');
  });

  it('canonicalizes YouTube embed URLs', () => {
    const raw = 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1';
    const { canonicalUrl, sessionKey } = normalizeSessionUrl(raw);
    expect(canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(sessionKey).toBe('yt_dQw4w9WgXcQ');
  });

  it('canonicalizes YouTube shorts URLs', () => {
    const raw = 'https://www.youtube.com/shorts/dQw4w9WgXcQ';
    const { canonicalUrl, sessionKey } = normalizeSessionUrl(raw);
    expect(canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(sessionKey).toBe('yt_dQw4w9WgXcQ');
  });

  it('canonicalizes Vimeo video URLs', () => {
    const raw = 'https://vimeo.com/76979871?param=1';
    const { canonicalUrl, sessionKey } = normalizeSessionUrl(raw);
    expect(canonicalUrl).toBe('https://vimeo.com/76979871');
    expect(sessionKey).toBe('vimeo_76979871');
  });

  it('canonicalizes Canvas LMS module URLs', () => {
    const raw =
      'https://canvas.instructure.com/courses/12345/modules/items/67890?utm_source=email#tab';
    const { canonicalUrl, sessionKey } = normalizeSessionUrl(raw);
    expect(canonicalUrl).toBe('https://canvas.instructure.com/courses/12345/modules/items/67890');
    expect(sessionKey).toContain('canvas_instructure_com');
  });

  it('canonicalizes local video file URLs', () => {
    const raw = 'file:///C:/Users/Helmi/Videos/lecture_01.mp4?t=10#view';
    const { canonicalUrl, sessionKey } = normalizeSessionUrl(raw);
    expect(canonicalUrl).toBe('file:///C:/Users/Helmi/Videos/lecture_01.mp4');
    expect(sessionKey).toContain('file_');
  });

  it('handles empty or malformed URL input gracefully without throwing', () => {
    const { canonicalUrl, sessionKey } = normalizeSessionUrl('');
    expect(canonicalUrl).toBe('');
    expect(sessionKey).toBe('session_unknown');
  });
});

describe('sessionManager - sanitizeFileName', () => {
  it('replaces forbidden filesystem characters with dashes', () => {
    const title = 'Lecture 1: Intro <to> Quantum "Physics" / Mechanics? *';
    const sanitized = sanitizeFileName(title);
    expect(sanitized).toBe('Lecture 1- Intro -to- Quantum -Physics- - Mechanics- -');
  });

  it('strips redundant trailing .md', () => {
    const title = 'Quantum Computing.md';
    expect(sanitizeFileName(title)).toBe('Quantum Computing');
  });

  it('falls back to Video-Notes if input is empty or whitespace', () => {
    expect(sanitizeFileName('')).toBe('Video-Notes');
    expect(sanitizeFileName('   ')).toBe('Video-Notes');
  });
});

describe('sessionManager - createDefaultSession', () => {
  it('creates an initialized session object with normalized keys', () => {
    const session = createDefaultSession(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s',
      'Never Gonna Give You Up - YouTube',
      12
    );
    expect(session.sessionKey).toBe('yt_dQw4w9WgXcQ');
    expect(session.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(session.title).toBe('Never Gonna Give You Up');
    expect(session.targetFileName).toBe('Never Gonna Give You Up.md');
    expect(session.markdown).toBe('');
    expect(session.frames).toEqual([]);
    expect(session.captionItems).toEqual([]);
    expect(session.tabId).toBe(12);
  });
});
