"""
Chrome Live Caption Bridge for Video Notes Extension
-----------------------------------------------------
Connects to Windows UI Automation to read real-time captions from:
  1. Google Chrome Live Caption (chrome://settings/accessibility)
  2. Windows 11 Live Captions (Win + Ctrl + L)

Broadcasts streaming transcripts over a local WebSocket server (ws://127.0.0.1:8765)
so the Video Notes Side Panel extension can capture, timestamp, and insert them
directly into your Obsidian Markdown notes.

Usage:
  python caption_bridge.py [--port 8765]
"""

import sys
import os
import re
import time
import json
import asyncio
import argparse
from typing import Set, Optional, Tuple, Any, List

try:
    import uiautomation as auto
except ImportError:
    print("\n[ERROR] Missing required library 'uiautomation'.")
    print("Please install it with: pip install uiautomation websockets\n")
    sys.exit(1)

try:
    import websockets
except ImportError:
    print("\n[ERROR] Missing required library 'websockets'.")
    print("Please install it with: pip install uiautomation websockets\n")
    sys.exit(1)

# Connected WebSocket clients
CLIENTS: Set[Any] = set()

IGNORE_NAMES = {
    'live caption', 'live captions', 'caption', 'captions',
    'back to tab', 'pin', 'unpin', 'settings', 'close',
    'minimize', 'maximize', 'system menu', 'expand', 'collapse',
    'more options', 'live caption settings',
}

BROWSER_WINDOW_MARKERS = (
    ' - google chrome',
    ' - chrome',
    ' - chromium',
    ' - microsoft edge',
    ' - brave',
    ' - vivaldi',
    ' - opera',
    ' - mozilla firefox',
)

def _is_browser_window_name(win_name: Optional[str]) -> bool:
    """Return True if window Name belongs to a regular browser tab window rather than the caption bubble."""
    if not win_name:
        return False
    lower = win_name.strip().lower()
    if lower in ('google chrome', 'new tab', 'microsoft edge', 'brave', 'chromium'):
        return True
    return any(marker in lower for marker in BROWSER_WINDOW_MARKERS)

def _is_transient_uia_error(err: Exception) -> bool:
    return isinstance(err, (LookupError, TimeoutError, OSError)) or type(err).__name__ == 'COMError'

def find_live_caption_text() -> Tuple[Optional[str], Optional[str]]:
    """
    Search for active Chrome Live Caption or Windows Live Caption window.
    Returns (caption_text, source_name) or (None, None).
    """
    # 1. Check Chrome Live Caption (Standard Chromium bubble)
    try:
        for name_kw in ('Live Caption', 'Live Captions'):
            chrome_caption = auto.WindowControl(
                searchDepth=1,
                ClassName='Chrome_WidgetWin_1',
                SubName=name_kw
            )
            if chrome_caption.Exists(maxSearchSeconds=0.05):
                win_name = getattr(chrome_caption, 'Name', None)
                if _is_browser_window_name(win_name):
                    continue

                # Try DocumentControl first (do not filter spoken utterances via IGNORE_NAMES)
                doc = chrome_caption.DocumentControl()
                if doc.Exists(maxSearchSeconds=0.05) and doc.Name:
                    text = doc.Name.strip()
                    if text:
                        return text, "Chrome Live Caption"

                # Check text controls or child controls (filter UI chrome/buttons)
                for child in chrome_caption.GetChildren():
                    if getattr(child, 'ControlTypeName', '') == 'ButtonControl':
                        continue
                    name = child.Name.strip() if child.Name else ""
                    if name and name.lower() not in IGNORE_NAMES and len(name) > 1:
                        return name, "Chrome Live Caption"
    except Exception as err:
        if not _is_transient_uia_error(err):
            print(f"\n[Warning] Chrome Live Caption UIA check error: {type(err).__name__}: {err}")

    # 2. Check Windows 11 Native Live Captions (Win + Ctrl + L)
    try:
        win11_caption = auto.WindowControl(
            searchDepth=1,
            ClassName='LiveCaptionDesktopWindow'
        )
        if win11_caption.Exists(maxSearchSeconds=0.05):
            # Check for text elements
            for child in win11_caption.GetChildren():
                if child.ControlTypeName in ('TextControl', 'PaneControl') and child.Name:
                    text = child.Name.strip()
                    if text and text.lower() not in IGNORE_NAMES:
                        return text, "Windows Live Captions"
    except Exception as err:
        if not _is_transient_uia_error(err):
            print(f"\n[Warning] Windows Live Captions UIA check error: {type(err).__name__}: {err}")

    # 3. Fallback scan: Search top-level non-browser windows with 'Live Caption' in SubName
    try:
        fallback = auto.WindowControl(searchDepth=1, SubName='Live Caption')
        if fallback.Exists(maxSearchSeconds=0.05):
            win_name = getattr(fallback, 'Name', None)
            if not _is_browser_window_name(win_name):
                doc = fallback.DocumentControl()
                if doc.Exists(maxSearchSeconds=0.05) and doc.Name:
                    text = doc.Name.strip()
                    if text:
                        return text, "Live Caption"
    except Exception as err:
        if not _is_transient_uia_error(err):
            print(f"\n[Warning] Fallback Live Caption UIA check error: {type(err).__name__}: {err}")

    return None, None

def _tokens_stem_match(a: str, b: str) -> bool:
    """Return True when two normalized tokens share a stem from mid-word ASR revision."""
    if not a or not b:
        return False
    if a == b:
        return True
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if len(shorter) >= 2 and longer.startswith(shorter):
        return True
    if len(shorter) >= 4:
        common = 0
        for ca, cb in zip(a, b):
            if ca != cb:
                break
            common += 1
        if common >= 4:
            return True
    return False


def _has_aligned_prefix_context(
    acc_before: List[str],
    inc_before: List[str],
    anchor_len: int,
) -> bool:
    """
    Verify tokens preceding an interior overlap came from prior accumulated history,
    preventing false truncation when a new sentence reuses common trailing filler phrases.
    """
    if not inc_before:
        return True
    if len(inc_before) >= 4:
        if len(acc_before) < 2:
            return False
        acc_bigrams = set(zip(acc_before, acc_before[1:]))
        total_bigrams = len(inc_before) - 1
        bigram_hits = sum(
            1
            for i in range(total_bigrams)
            if (inc_before[i], inc_before[i + 1]) in acc_bigrams
        )
        if anchor_len == 2:
            return bigram_hits >= 5 and (bigram_hits / total_bigrams) >= 0.60
        if anchor_len >= 8 and bigram_hits >= 2:
            return True
        return bigram_hits >= 2 and (bigram_hits / total_bigrams) >= 0.30

    if not acc_before or anchor_len < 3:
        return False
    recent_tail = set(acc_before[-10:])
    recent_hits = sum(1 for tok in inc_before if tok in recent_tail)
    if anchor_len >= 6 and recent_hits >= 1:
        return True
    required = 1 if len(inc_before) == 1 else 2
    return recent_hits >= required


def _find_tail_anchor_end_idx(
    overlap_window_acc: List[str],
    norm_inc: List[str],
) -> Optional[int]:
    """
    Find where the suffix of overlap_window_acc ends inside norm_inc.
    Supports exact scroll-off (pos == 0), un-scrolled rolling bubbles with earlier edits (pos > 0),
    and minor 1-2 token ASR seam revisions at the very end of accumulated text.
    """
    acc_len = len(overlap_window_acc)
    inc_len = len(norm_inc)
    if acc_len < 2 or inc_len < 2:
        return None

    # Pass 1 (skip == 0): prefer strong head scroll-off (pos == 0, len >= 3)
    max_head = min(inc_len, acc_len)
    for l in range(max_head, 2, -1):
        if overlap_window_acc[-l:] == norm_inc[:l]:
            return l - 1

    # Pass 2 (skip == 0, pos > 0): bubble head stayed visible while an earlier word/comma changed
    max_inner = min(inc_len, acc_len, 40)
    for l in range(max_inner, 1, -1):
        suffix = overlap_window_acc[-l:]
        for pos in range(inc_len - l, 0, -1):
            if norm_inc[pos : pos + l] == suffix and _has_aligned_prefix_context(
                overlap_window_acc[:-l], norm_inc[:pos], l
            ):
                return pos + l - 1

    # Pass 3 (skip == 0, pos == 0, l == 2): two-word rolling boundary fallback
    if overlap_window_acc[-2:] == norm_inc[:2]:
        return 1

    # Pass 4 (skip in (1, 2)): minor ASR revision right at the trailing seam (e.g. "node it" -> "node itself")
    for skip in (1, 2):
        if acc_len < skip + 3:
            continue
        max_seam = min(inc_len, acc_len - skip, 40)
        skipped_tokens = overlap_window_acc[-skip:]
        acc_prefix_base = acc_len - skip
        for l in range(max_seam, 2, -1):
            suffix = overlap_window_acc[acc_prefix_base - l : acc_prefix_base]
            for pos in range(inc_len - l, -1, -1):
                if norm_inc[pos : pos + l] != suffix:
                    continue
                if pos == 0:
                    next_pos = pos + l
                    has_seam_stem = next_pos < inc_len and any(
                        _tokens_stem_match(norm_inc[next_pos], s) for s in skipped_tokens
                    )
                    if l < 4 and not (skip == 1 and has_seam_stem):
                        continue
                elif not _has_aligned_prefix_context(
                    overlap_window_acc[: acc_prefix_base - l], norm_inc[:pos], l
                ):
                    continue

                end_idx = pos + l - 1
                next_pos = pos + l
                if next_pos < inc_len:
                    next_tok = norm_inc[next_pos]
                    if (len(skipped_tokens) == 2 and "".join(skipped_tokens) == next_tok) or any(
                        _tokens_stem_match(next_tok, s) for s in skipped_tokens
                    ):
                        end_idx = next_pos
                return end_idx

    return None


def extract_delta_text(accumulated: str, incoming: str) -> str:
    """
    Given accumulated finalized text and incoming caption buffer,
    returns only the new delta/suffix.
    """
    clean_inc = " ".join(incoming.split()).strip()
    clean_acc = " ".join(accumulated.split()).strip()

    if not clean_acc:
        return clean_inc
    if not clean_inc or clean_inc == clean_acc:
        return ""

    leading_punct = " ,;.?!:—-"

    # 1. Word-boundary direct prefix match
    if clean_inc.startswith(clean_acc):
        ends_with_boundary_punct = clean_acc[-1] in (",", ".", ";", ":", "!", "?", "—") or clean_acc[-1].isspace()
        next_char = clean_inc[len(clean_acc)] if len(clean_inc) > len(clean_acc) else ""
        next_is_boundary = bool(next_char) and not (next_char.isalnum() or next_char in ("'", "’", "_", "-"))
        if ends_with_boundary_punct or next_is_boundary:
            return clean_inc[len(clean_acc):].lstrip(leading_punct).strip()

    def norm(w: str) -> str:
        return "".join(c.lower() for c in w if c.isalnum())

    words_inc = clean_inc.split()
    words_acc = clean_acc.split()

    norm_acc_tokens = [n for w in words_acc if (n := norm(w))]
    inc_tokens = [(idx, n) for idx, w in enumerate(words_inc) if (n := norm(w))]

    if not inc_tokens:
        return ""

    norm_inc = [n for _, n in inc_tokens]

    def slice_after_token(end_tok_idx: int) -> str:
        if end_tok_idx + 1 >= len(inc_tokens):
            return ""
        start_word_idx = inc_tokens[end_tok_idx][0] + 1
        return " ".join(words_inc[start_word_idx:]).lstrip(leading_punct).strip()

    # 1b. Normalized token prefix match (handles comma/period edits in already-committed text)
    if len(norm_acc_tokens) >= 2 and len(norm_acc_tokens) <= len(norm_inc):
        if norm_inc[: len(norm_acc_tokens)] == norm_acc_tokens:
            return slice_after_token(len(norm_acc_tokens) - 1)

    recent_acc = norm_acc_tokens[-50:]

    # 2. Bounded recent token-sequence containment check
    if len(norm_inc) >= 2:
        n_len = len(norm_inc)
        for start in range(len(recent_acc) - n_len + 1):
            if recent_acc[start:start + n_len] == norm_inc:
                return ""
    elif recent_acc and recent_acc[-1] == norm_inc[0]:
        if clean_acc.lower().endswith(clean_inc.lower()) or not clean_acc.endswith((".", "!", "?")):
            return ""

    # 3. Tail-anchor overlap alignment across both head-scrolled and un-scrolled bubbles
    overlap_window_acc = norm_acc_tokens[-150:]
    end_tok_idx = _find_tail_anchor_end_idx(overlap_window_acc, norm_inc)
    if end_tok_idx is not None:
        return slice_after_token(end_tok_idx)

    return clean_inc


_TERMINAL_SENTENCE_RE = re.compile(r'(?<!\.\.)[.?!]["\')\]]*$')
_INTERIOR_SENTENCE_SPLIT_RE = re.compile(
    r'(?<!\.)(?<![A-Za-z]\.[A-Za-z])[.?!](?!\.)["\')\]]*(?=\s+["\'\(\[]?[A-Z0-9])'
)


def _split_completed_sentences(text: str) -> Tuple[str, str]:
    """
    Split completed leading sentence(s) from an incomplete trailing clause when
    multiple sentences arrive in the same polling interval.
    """
    matches = list(_INTERIOR_SENTENCE_SPLIT_RE.finditer(text))
    if not matches:
        return "", text
    split_pos = matches[-1].end()
    completed = text[:split_pos].strip()
    trailing = text[split_pos:].strip()
    return completed, trailing


class CaptionStreamTracker:
    """
    Tracks streaming caption text changes, deduplicates rolling window text,
    and extracts only newly spoken delta sentences.
    """
    def __init__(self, pause_seconds: float = 4.0):
        self.pause_seconds: float = pause_seconds
        self.last_raw: str = ""
        self.last_update_time: float = time.time()
        self.accumulated: str = ""
        self.pending_delta: str = ""

    def flush_pending(self, now: Optional[float] = None) -> Optional[dict]:
        """Commit and emit any buffered uncommitted delta (e.g., on bubble detach or pause)."""
        if not self.pending_delta:
            return None
        if now is None:
            now = time.time()
        committed = self.pending_delta
        self.accumulated += (" " if self.accumulated else "") + committed
        self.pending_delta = ""
        return {
            "type": "CAPTION_UPDATE",
            "text": self.last_raw or committed,
            "delta": committed,
            "isFinal": True,
            "timestamp": now,
        }

    def process_events(self, raw_text: str, now: Optional[float] = None) -> List[dict]:
        """
        Process a new raw text observation from the caption window.
        Returns 0..2 event dicts ordered chronologically so completed sentences commit
        immediately while trailing unpunctuated clauses stay interim.
        """
        if not raw_text:
            return []

        clean = " ".join(raw_text.split()).strip()
        if not clean:
            return []

        if now is None:
            now = time.time()

        # If text hasn't changed since last poll, commit pending text after speech pause
        if clean == self.last_raw:
            if self.pending_delta and (now - self.last_update_time) >= self.pause_seconds:
                flushed = self.flush_pending(now=now)
                return [flushed] if flushed else []
            return []

        self.last_update_time = now
        self.last_raw = clean

        delta = extract_delta_text(self.accumulated, clean)
        if not delta or not any(c.isalnum() for c in delta):
            self.pending_delta = ""
            return []

        has_sentence_end = bool(_TERMINAL_SENTENCE_RE.search(clean)) or bool(_TERMINAL_SENTENCE_RE.search(delta))

        if has_sentence_end:
            self.accumulated += (" " if self.accumulated else "") + delta
            self.pending_delta = ""
            return [{
                "type": "CAPTION_UPDATE",
                "text": clean,
                "delta": delta,
                "isFinal": True,
                "timestamp": now,
            }]

        # If delta holds completed sentences followed by a new incomplete clause,
        # commit the completed portion right away and buffer only the trailing clause.
        completed, trailing = _split_completed_sentences(delta)
        events: List[dict] = []
        if completed:
            self.accumulated += (" " if self.accumulated else "") + completed
            events.append({
                "type": "CAPTION_UPDATE",
                "text": clean,
                "delta": completed,
                "isFinal": True,
                "timestamp": now,
            })

        # Keep mid-sentence / unpunctuated updates in pending_delta so ASR revisions overwrite cleanly
        self.pending_delta = trailing
        if trailing:
            events.append({
                "type": "CAPTION_UPDATE",
                "text": clean,
                "delta": trailing,
                "isFinal": False,
                "timestamp": now,
            })
        return events

    def process(self, raw_text: str, now: Optional[float] = None) -> Optional[dict]:
        """
        Single-event convenience wrapper around process_events() for callers
        expecting at most one event per poll.
        """
        events = self.process_events(raw_text, now=now)
        if not events:
            return None
        return events[0]

async def broadcast_event(event: dict):
    """Send JSON event to all connected extension clients."""
    if not CLIENTS:
        return
    message = json.dumps(event)
    disconnected = set()
    for ws in CLIENTS:
        try:
            await ws.send(message)
        except websockets.ConnectionClosed:
            disconnected.add(ws)
        except Exception as e:
            print(f"[Warning] Error sending to client: {e}")
            disconnected.add(ws)
    CLIENTS.difference_update(disconnected)

async def caption_monitor_loop(tracker: CaptionStreamTracker):
    """Continuous polling loop for Chrome Live Caption window."""
    last_found_source: Optional[str] = None
    notified_waiting = False
    last_error_msg: Optional[str] = None
    last_error_log_time: float = 0.0

    while True:
        try:
            text, source = find_live_caption_text()

            if text:
                if source != last_found_source:
                    print(f"\n[Bridge] Attached to: {source}")
                    last_found_source = source
                    await broadcast_event({
                        "type": "SOURCE_ATTACHED",
                        "source": source
                    })

                for event in tracker.process_events(text):
                    # Print preview in console (displaying new delta words)
                    preview = event.get("delta") or event["text"]
                    if len(preview) > 60:
                        preview = "..." + preview[-57:]
                    sys.stdout.write(f"\r[Live] {preview:<65}")
                    sys.stdout.flush()

                    await broadcast_event(event)
            else:
                if last_found_source is not None:
                    flush_event = tracker.flush_pending()
                    if flush_event:
                        await broadcast_event(flush_event)
                    print(f"\n[Bridge] Caption window closed or hidden.")
                    last_found_source = None
                    await broadcast_event({"type": "SOURCE_DETACHED"})
                elif not notified_waiting and len(CLIENTS) > 0:
                    sys.stdout.write("\r[Bridge] Waiting for speech in Chrome Live Caption...    ")
                    sys.stdout.flush()
                    notified_waiting = True

            last_error_msg = None

        except Exception as err:
            now = time.time()
            err_msg = f"{type(err).__name__}: {err}"
            if not _is_transient_uia_error(err) or err_msg != last_error_msg or (now - last_error_log_time) >= 5.0:
                print(f"\n[Warning] Caption monitor error: {err_msg}")
                last_error_msg = err_msg
                last_error_log_time = now

        await asyncio.sleep(0.18)

async def ws_handler(websocket):
    """Handle incoming WebSocket connection from the Chrome extension."""
    CLIENTS.add(websocket)
    client_ip = websocket.remote_address[0] if websocket.remote_address else 'unknown'
    print(f"\n[Bridge] Extension connected from {client_ip} (Total clients: {len(CLIENTS)})")

    # Send handshake welcome
    await websocket.send(json.dumps({
        "type": "INIT",
        "status": "connected",
        "message": "Chrome Live Caption Bridge connected.",
        "port": 8765,
    }))

    try:
        async for msg in websocket:
            try:
                data = json.loads(msg)
                if data.get("type") == "PING":
                    await websocket.send(json.dumps({"type": "PONG"}))
            except Exception:
                pass
    except websockets.ConnectionClosed:
        pass
    finally:
        CLIENTS.discard(websocket)
        print(f"\n[Bridge] Extension client disconnected. (Remaining: {len(CLIENTS)})")

async def main():
    parser = argparse.ArgumentParser(description="Chrome Live Caption Bridge for Video Notes")
    parser.add_argument("--port", type=int, default=8765, help="WebSocket port (default: 8765)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host address (default: 127.0.0.1)")
    args = parser.parse_args()

    tracker = CaptionStreamTracker()

    print("=" * 65)
    print("  Video Notes - Chrome Live Caption Bridge")
    print("=" * 65)
    print(f" -> Listening for extension on ws://{args.host}:{args.port}")
    print(" -> Requirements:")
    print("    1. Chrome Live Caption turned ON in chrome://settings/accessibility")
    print("    2. Play any video or audio in Google Chrome")
    print(" -> Press Ctrl+C in this terminal to stop.")
    print("=" * 65 + "\n")

    # Start WebSocket server
    async with websockets.serve(ws_handler, args.host, args.port):
        # Start background UIA monitor
        await caption_monitor_loop(tracker)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Bridge] Stopped by user.")
