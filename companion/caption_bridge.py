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
import time
import json
import asyncio
import argparse
from typing import Set, Optional, Tuple, Any

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

def find_live_caption_text() -> Tuple[Optional[str], Optional[str]]:
    """
    Search for active Chrome Live Caption or Windows Live Caption window.
    Returns (caption_text, source_name) or (None, None).
    """
    # 1. Check Chrome Live Caption (Standard Chromium bubble)
    try:
        # Chrome Live Caption usually has ClassName 'Chrome_WidgetWin_1' and Name contains 'Live Caption'
        chrome_caption = auto.WindowControl(
            searchDepth=1,
            ClassName='Chrome_WidgetWin_1',
            SubName='Live Caption'
        )
        if chrome_caption.Exists(maxSearchSeconds=0.05):
            # Try DocumentControl first
            doc = chrome_caption.DocumentControl()
            if doc.Exists(maxSearchSeconds=0.05) and doc.Name:
                text = doc.Name.strip()
                if text:
                    return text, "Chrome Live Caption"

            # Check text controls or child controls
            for child in chrome_caption.GetChildren():
                name = child.Name.strip() if child.Name else ""
                if name and name != "Live Caption" and len(name) > 1:
                    return name, "Chrome Live Caption"
    except Exception:
        pass

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
                    if text:
                        return text, "Windows Live Captions"
    except Exception:
        pass

    # 3. Fallback scan: Search top-level windows with 'Live Caption' in SubName
    try:
        fallback = auto.WindowControl(searchDepth=1, SubName='Live Caption')
        if fallback.Exists(maxSearchSeconds=0.05):
            doc = fallback.DocumentControl()
            if doc.Exists(maxSearchSeconds=0.05) and doc.Name:
                text = doc.Name.strip()
                if text:
                    return text, "Live Caption"
    except Exception:
        pass

    return None, None

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

    if clean_inc.startswith(clean_acc):
        return clean_inc[len(clean_acc):].lstrip(" ,;.-")

    def norm(w: str) -> str:
        return "".join(c.lower() for c in w if c.isalnum())

    words_inc = clean_inc.split()
    words_acc = clean_acc.split()
    norm_inc = [norm(w) for w in words_inc]
    norm_acc = [norm(w) for w in words_acc]

    full_norm_inc = " ".join(w for w in norm_inc if w)
    full_norm_acc = " ".join(w for w in norm_acc if w)
    if full_norm_inc in full_norm_acc:
        return ""

    max_check = min(len(words_inc), len(words_acc))
    for l in range(max_check, 0, -1):
        if norm_acc[-l:] == norm_inc[:l]:
            remaining = words_inc[l:]
            return " ".join(remaining).lstrip(" ,;.-")

    return clean_inc

class CaptionStreamTracker:
    """
    Tracks streaming caption text changes, deduplicates rolling window text,
    and extracts only newly spoken delta sentences.
    """
    def __init__(self):
        self.last_raw: str = ""
        self.last_update_time: float = time.time()
        self.accumulated: str = ""

    def process(self, raw_text: str) -> Optional[dict]:
        """
        Process a new raw text observation from the caption window.
        Returns an event dict with 'delta' containing only the new text.
        """
        if not raw_text or raw_text == self.last_raw:
            return None

        clean = " ".join(raw_text.split())
        now = time.time()
        self.last_update_time = now
        self.last_raw = raw_text

        delta = extract_delta_text(self.accumulated, clean)
        has_period = clean.endswith(('.', '!', '?')) or (delta and delta.endswith(('.', '!', '?')))

        if has_period and delta and len(delta) > 1:
            self.accumulated += (" " if self.accumulated else "") + delta

        event = {
            "type": "CAPTION_UPDATE",
            "text": clean,
            "delta": delta,
            "isFinal": has_period,
            "timestamp": now,
        }

        return event

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

                event = tracker.process(text)
                if event:
                    # Print preview in console (displaying new delta words)
                    preview = event.get("delta") or event["text"]
                    if len(preview) > 60:
                        preview = "..." + preview[-57:]
                    sys.stdout.write(f"\r[Live] {preview:<65}")
                    sys.stdout.flush()

                    await broadcast_event(event)
            else:
                if last_found_source is not None:
                    print(f"\n[Bridge] Caption window closed or hidden.")
                    last_found_source = None
                    await broadcast_event({"type": "SOURCE_DETACHED"})
                elif not notified_waiting and len(CLIENTS) > 0:
                    sys.stdout.write("\r[Bridge] Waiting for speech in Chrome Live Caption...    ")
                    sys.stdout.flush()
                    notified_waiting = True

        except Exception as err:
            # Keep loop alive even if UIA transiently throws
            pass

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
