"""
Chrome Live Caption Bridge for Video Notes Extension
-----------------------------------------------------
Connects to Native Desktop Accessibility APIs to capture real-time captions:
  - Windows: Windows UI Automation (Chrome Live Caption & Windows 11 Live Captions)
  - Linux: AT-SPI2 Accessibility (Chrome / Chromium / Brave / Edge Live Caption)

Broadcasts streaming transcripts over a local WebSocket server (ws://127.0.0.1:8765)
so the Video Notes Side Panel extension can capture, timestamp, and insert them
directly into your Obsidian Markdown notes.

Usage:
  npm run caption-bridge [-- --port 8765] [-- --demo]
"""

import sys
import os
import time
import json
import asyncio
import argparse
import importlib
import re
from typing import Set, Optional, Tuple, Any, List

IS_WINDOWS = sys.platform == "win32"
IS_LINUX = sys.platform.startswith("linux")

HAS_UIA = False
HAS_ATSPI = False

auto: Any = None
pyatspi: Any = None

# 1. Initialize Windows UI Automation if on Windows
if IS_WINDOWS:
    try:
        auto = importlib.import_module("uiautomation")
        HAS_UIA = True
    except Exception:
        HAS_UIA = False
        auto = None

# 2. Initialize Linux AT-SPI2 if on Linux
if IS_LINUX:
    if "AT_SPI_BUS_ADDRESS" not in os.environ and hasattr(os, "getuid"):
        bus_candidate = f"/run/user/{os.getuid()}/at-spi/bus_0"
        if os.path.exists(bus_candidate):
            os.environ["AT_SPI_BUS_ADDRESS"] = f"unix:path={bus_candidate}"

    # Enable AT-SPI in session D-Bus so Chromium registers its accessible tree
    try:
        dbus_mod = importlib.import_module("dbus")
        session_bus = dbus_mod.SessionBus()
        a11y_bus_obj = session_bus.get_object("org.a11y.Bus", "/org/a11y/bus")
        props_iface = dbus_mod.Interface(a11y_bus_obj, "org.freedesktop.DBus.Properties")
        props_iface.Set("org.a11y.Status", "IsEnabled", dbus_mod.Boolean(True))
        props_iface.Set("org.a11y.Status", "ScreenReaderEnabled", dbus_mod.Boolean(True))
    except Exception:
        pass

    try:
        from gi.repository import GLib
        def _suppress_dbind(domain, level, message, user_data):
            pass
        GLib.log_set_handler("dbind", GLib.LogLevelFlags.LEVEL_WARNING | GLib.LogLevelFlags.LEVEL_MESSAGE, _suppress_dbind, None)
    except Exception:
        pass

    try:
        pyatspi = importlib.import_module("pyatspi")
        HAS_ATSPI = True
    except Exception:
        HAS_ATSPI = False
        pyatspi = None

try:
    import websockets
except ImportError:
    print("\n[ERROR] Missing required library 'websockets'.")
    print("Please install it with: pip install websockets\n")
    sys.exit(1)

# Connected WebSocket clients
CLIENTS: Set[Any] = set()

# Strings to ignore when extracting caption text from UI accessibility elements
IGNORE_STRINGS = {
    "live caption",
    "back to tab",
    "turn off live caption for now",
    "show more lines",
    "show fewer lines",
    "live caption visible, use window switcher to focus",
    "translating",
    "live caption is not available right now",
    "pin caption",
    "close",
    "downloading speech files...",
    "downloading...",
    "speech files downloaded",
    "language",
    "english",
}

def find_linux_chrome_caption() -> Tuple[Optional[str], Optional[str]]:
    """
    Search for active Chrome / Chromium Live Caption window via AT-SPI2 on Linux.
    Returns (caption_text, source_name) or (None, None).
    """
    if not HAS_ATSPI or pyatspi is None:
        return None, None

    try:
        desk = pyatspi.Registry.getDesktop(0)
    except Exception:
        return None, None

    if not desk:
        return None, None

    for i in range(desk.childCount):
        try:
            app = desk.getChildAtIndex(i)
        except Exception:
            continue
        if not app:
            continue

        app_name = (getattr(app, "name", "") or "").lower()
        if not any(n in app_name for n in ("chrome", "chromium", "brave", "edge")):
            continue

        for j in range(app.childCount):
            try:
                win = app.getChildAtIndex(j)
            except Exception:
                continue
            if not win:
                continue

            win_name = (getattr(win, "name", "") or "").lower()
            if "live caption" not in win_name:
                continue

            # Found Chrome Live Caption window on Linux
            extracted: List[str] = []

            def walk_elements(obj, depth: int = 0):
                if not obj or depth > 8:
                    return

                role = obj.getRoleName() if hasattr(obj, "getRoleName") else ""
                if role in ("push button", "toggle button", "button"):
                    return

                text = ""
                try:
                    t = obj.queryText()
                    if t and t.characterCount > 0:
                        text = t.getText(0, t.characterCount) or ""
                except Exception:
                    pass

                name = getattr(obj, "name", "") or ""
                cand = (text if text and text != "\ufffc" else name).replace("\ufffc", "").strip()

                if cand and cand.lower() not in IGNORE_STRINGS and len(cand) > 1:
                    clean = " ".join(cand.split())
                    if clean and clean not in extracted:
                        extracted.append(clean)

                for k in range(obj.childCount):
                    try:
                        walk_elements(obj.getChildAtIndex(k), depth + 1)
                    except Exception:
                        pass

            walk_elements(win)

            if extracted:
                return " ".join(extracted), "Chrome Live Caption (Linux)"
            else:
                # Window is attached and open, waiting for speech
                return "", "Chrome Live Caption (Linux)"

    return None, None

def find_windows_caption() -> Tuple[Optional[str], Optional[str]]:
    """
    Search for active Chrome Live Caption or Windows Live Caption window via Windows UIA.
    Returns (caption_text, source_name) or (None, None).
    """
    if not HAS_UIA or auto is None:
        return None, None

    # 1. Check Chrome Live Caption
    try:
        chrome_caption = auto.WindowControl(
            searchDepth=1,
            ClassName='Chrome_WidgetWin_1',
            SubName='Live Caption'
        )
        if chrome_caption.Exists(maxSearchSeconds=0.05):
            doc = chrome_caption.DocumentControl()
            if doc.Exists(maxSearchSeconds=0.05) and doc.Name:
                text = doc.Name.strip()
                if text:
                    return text, "Chrome Live Caption"

            for child in chrome_caption.GetChildren():
                name = child.Name.strip() if child.Name else ""
                if name and name != "Live Caption" and len(name) > 1:
                    return name, "Chrome Live Caption"
            return "", "Chrome Live Caption"
    except Exception:
        pass

    # 2. Check Windows 11 Native Live Captions (Win + Ctrl + L)
    try:
        win11_caption = auto.WindowControl(
            searchDepth=1,
            ClassName='LiveCaptionDesktopWindow'
        )
        if win11_caption.Exists(maxSearchSeconds=0.05):
            for child in win11_caption.GetChildren():
                if child.ControlTypeName in ('TextControl', 'PaneControl') and child.Name:
                    text = child.Name.strip()
                    if text:
                        return text, "Windows Live Captions"
            return "", "Windows Live Captions"
    except Exception:
        pass

    # 3. Fallback scan
    try:
        fallback = auto.WindowControl(searchDepth=1, SubName='Live Caption')
        if fallback.Exists(maxSearchSeconds=0.05):
            doc = fallback.DocumentControl()
            if doc.Exists(maxSearchSeconds=0.05) and doc.Name:
                text = doc.Name.strip()
                if text:
                    return text, "Live Caption"
            return "", "Live Caption"
    except Exception:
        pass

    return None, None

def find_live_caption_text() -> Tuple[Optional[str], Optional[str]]:
    """
    Platform-agnostic Live Caption finder:
    Uses Windows UIA on Windows, AT-SPI2 on Linux.
    """
    if IS_WINDOWS and HAS_UIA:
        return find_windows_caption()
    elif IS_LINUX and HAS_ATSPI:
        return find_linux_chrome_caption()
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
    and breaks incoming speech streams into discrete sentences and paused utterances.
    """
    def __init__(self):
        self.last_raw: str = ""
        self.last_update_time: float = time.time()
        self.accumulated: str = ""
        self.pending_chunk: str = ""

    def process(self, raw_text: str) -> List[dict]:
        """
        Process a new raw text observation from the caption window.
        Returns a list of event dicts for completed sentences or in-progress speech.
        """
        if not raw_text or raw_text == self.last_raw:
            return []

        clean = " ".join(raw_text.split()).strip()
        now = time.time()
        self.last_update_time = now
        self.last_raw = raw_text

        delta = extract_delta_text(self.accumulated, clean)
        if not delta:
            return []

        events: List[dict] = []

        # 1. Match complete sentences ending with . ! ? followed by whitespace or end of string
        sentences = re.findall(r"([^.?!]+[.?!])(?:\s+|$)", delta)
        if sentences:
            for s in sentences:
                s_clean = s.strip()
                if s_clean and len(s_clean) > 1:
                    self.accumulated += (" " if self.accumulated else "") + s_clean
                    events.append({
                        "type": "CAPTION_UPDATE",
                        "text": clean,
                        "delta": s_clean,
                        "isFinal": True,
                        "timestamp": now,
                    })

            # Check if there is remaining incomplete text after the last sentence
            last_end = delta.rfind(sentences[-1]) + len(sentences[-1])
            remainder = delta[last_end:].strip()
            self.pending_chunk = remainder
            if remainder:
                events.append({
                    "type": "CAPTION_UPDATE",
                    "text": clean,
                    "delta": remainder,
                    "isFinal": False,
                    "timestamp": now,
                })
        else:
            # 2. Check if continuous speech is getting long (> 20 words) with natural clause breaks
            words = delta.split()
            if len(words) >= 20 and any(w.endswith(",") for w in words[12:]):
                comma_idx = max(i for i, w in enumerate(words) if w.endswith(",") and i <= 24)
                clause = " ".join(words[:comma_idx + 1])
                remainder = " ".join(words[comma_idx + 1:])
                self.accumulated += (" " if self.accumulated else "") + clause
                events.append({
                    "type": "CAPTION_UPDATE",
                    "text": clean,
                    "delta": clause,
                    "isFinal": True,
                    "timestamp": now,
                })
                self.pending_chunk = remainder
                if remainder:
                    events.append({
                        "type": "CAPTION_UPDATE",
                        "text": clean,
                        "delta": remainder,
                        "isFinal": False,
                        "timestamp": now,
                    })
            else:
                self.pending_chunk = delta
                events.append({
                    "type": "CAPTION_UPDATE",
                    "text": clean,
                    "delta": delta,
                    "isFinal": False,
                    "timestamp": now,
                })

        return events

    def check_silence(self) -> Optional[dict]:
        """
        Commit pending in-progress speech chunk if the speaker pauses for >= 1.5 seconds.
        Matches note-taking patterns where short thoughts or pauses are anchored to timestamps.
        """
        now = time.time()
        if self.pending_chunk and len(self.pending_chunk) > 1 and (now - self.last_update_time >= 1.5):
            clause = self.pending_chunk
            self.accumulated += (" " if self.accumulated else "") + clause
            self.pending_chunk = ""
            return {
                "type": "CAPTION_UPDATE",
                "text": self.last_raw,
                "delta": clause,
                "isFinal": True,
                "timestamp": now,
            }
        return None

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
    """Continuous polling loop for Chrome Live Caption window across Windows & Linux."""
    last_found_source: Optional[str] = None
    notified_waiting = False

    while True:
        try:
            text, source = find_live_caption_text()

            if source:
                if source != last_found_source:
                    print(f"\n[Bridge] Attached to: {source}")
                    last_found_source = source
                    notified_waiting = False
                    await broadcast_event({
                        "type": "SOURCE_ATTACHED",
                        "source": source
                    })

                if text:
                    events = tracker.process(text)
                    for event in events:
                        preview = event.get("delta") or event["text"]
                        if len(preview) > 60:
                            preview = "..." + preview[-57:]
                        prefix = "[Live Sent]" if event.get("isFinal") else "[Live]"
                        sys.stdout.write(f"\r{prefix} {preview:<65}")
                        sys.stdout.flush()

                        await broadcast_event(event)
                else:
                    silence_event = tracker.check_silence()
                    if silence_event:
                        await broadcast_event(silence_event)

                    if not notified_waiting and len(CLIENTS) > 0:
                        sys.stdout.write(f"\r[Bridge] Attached to {source}. Waiting for speech...   ")
                        sys.stdout.flush()
                        notified_waiting = True

                # Check pause silence even while window is active
                silence_event = tracker.check_silence()
                if silence_event:
                    preview = silence_event.get("delta") or ""
                    if len(preview) > 60:
                        preview = "..." + preview[-57:]
                    sys.stdout.write(f"\r[Live (Pause)] {preview:<65}\n> ")
                    sys.stdout.flush()
                    await broadcast_event(silence_event)

            else:
                if last_found_source is not None:
                    print(f"\n[Bridge] Caption window closed or hidden.")
                    last_found_source = None
                    notified_waiting = False
                    await broadcast_event({"type": "SOURCE_DETACHED"})

        except Exception:
            pass

        await asyncio.sleep(0.18)

SAMPLE_DEMO_CAPTIONS = [
    "Welcome to the lecture. Today we will explore modern system architectures.",
    "Notice how Obsidian Wikilinks seamlessly embed local screenshots.",
    "Timestamped note anchors allow one-click video seek synchronization.",
    "Google Gemini multimodal vision extracts formulas and diagrams directly.",
    "Live captions are deduplicated using rolling window delta normalization.",
    "Cornell notes structure key cues, notes, and lecture summaries effortlessly."
]

async def interactive_or_demo_loop(demo_mode: bool = False):
    """Allows interactive console typing and/or periodic demo captions."""
    async def stdin_reader():
        loop = asyncio.get_running_loop()
        while True:
            try:
                line = await loop.run_in_executor(None, sys.stdin.readline)
                if not line:
                    await asyncio.sleep(0.5)
                    continue
                text = line.strip()
                if not text:
                    continue

                event = {
                    "type": "CAPTION_UPDATE",
                    "text": text,
                    "delta": text,
                    "isFinal": True,
                    "timestamp": time.time(),
                }
                preview = text if len(text) <= 60 else "..." + text[-57:]
                sys.stdout.write(f"\r[Broadcast] {preview:<65}\n> ")
                sys.stdout.flush()
                await broadcast_event(event)
            except Exception:
                await asyncio.sleep(0.2)

    stdin_task = asyncio.create_task(stdin_reader())
    demo_index = 0

    try:
        while True:
            if demo_mode and CLIENTS:
                sentence = SAMPLE_DEMO_CAPTIONS[demo_index % len(SAMPLE_DEMO_CAPTIONS)]
                demo_index += 1
                event = {
                    "type": "CAPTION_UPDATE",
                    "text": sentence,
                    "delta": sentence,
                    "isFinal": True,
                    "timestamp": time.time(),
                }
                preview = sentence if len(sentence) <= 60 else "..." + sentence[-57:]
                sys.stdout.write(f"\r[Demo] {preview:<65}\n> ")
                sys.stdout.flush()
                await broadcast_event(event)
                await asyncio.sleep(5.0)
            else:
                await asyncio.sleep(0.5)
    finally:
        stdin_task.cancel()

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

    # If native caption source is already open, notify client immediately
    try:
        _, current_source = find_live_caption_text()
        if current_source:
            await websocket.send(json.dumps({
                "type": "SOURCE_ATTACHED",
                "source": current_source
            }))
    except Exception:
        pass

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
    parser.add_argument("--demo", action="store_true", help="Automatically stream demo captions when extension connects")
    args = parser.parse_args()

    tracker = CaptionStreamTracker()

    print("=" * 65)
    print("  Video Notes - Chrome Live Caption Bridge")
    print("=" * 65)
    print(f" -> Listening for extension on ws://{args.host}:{args.port}")

    if HAS_UIA:
        print(" -> Platform: Windows (UI Automation Active)")
        print("    1. Chrome Live Caption turned ON in chrome://settings/accessibility")
        print("    2. Play any video or audio in Google Chrome")
    elif HAS_ATSPI:
        print(" -> Platform: Linux (AT-SPI2 Accessibility Active)")
        print("    1. Chrome Live Caption turned ON in chrome://settings/accessibility")
        print("    2. Play any video or audio in Google Chrome")
        print("    3. Captions from Chrome floating window are automatically captured!")
    else:
        print(" -> Mode: Simulated / Interactive (No native accessibility backend)")
        print("    Type text into this terminal to broadcast captions.")

    if args.demo:
        print(" -> Demo Mode: Enabled (streaming sample lecture cues).")

    print(" -> Press Ctrl+C in this terminal to stop.")
    print("=" * 65 + "\n> ")
    sys.stdout.flush()

    # Start WebSocket server
    async with websockets.serve(ws_handler, args.host, args.port):
        monitor_task = asyncio.create_task(caption_monitor_loop(tracker))
        interactive_task = asyncio.create_task(interactive_or_demo_loop(demo_mode=args.demo))
        await asyncio.gather(monitor_task, interactive_task)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Bridge] Stopped by user.")
