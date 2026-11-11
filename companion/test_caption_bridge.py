import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

COMPANION_DIR = Path(__file__).resolve().parent
if str(COMPANION_DIR) not in sys.path:
    sys.path.insert(0, str(COMPANION_DIR))

import caption_bridge as cb  # noqa: E402


class FakeControl:
    def __init__(
        self,
        *,
        exists: bool = False,
        name: str = "",
        control_type: str = "WindowControl",
        doc: "FakeControl | None" = None,
        children: "list[FakeControl] | None" = None,
    ):
        self._exists = exists
        self.Name = name
        self.ControlTypeName = control_type
        self._doc = doc
        self._children = children or []
        self.last_max_search_seconds = None

    def Exists(self, maxSearchSeconds: float = 0.0) -> bool:
        self.last_max_search_seconds = maxSearchSeconds
        return self._exists

    def DocumentControl(self) -> "FakeControl":
        return self._doc if self._doc is not None else FakeControl(exists=False)

    def GetChildren(self) -> "list[FakeControl]":
        return list(self._children)


class FakeAuto:
    def __init__(self, handler):
        self._handler = handler
        self.calls = []

    def WindowControl(self, **kwargs):
        self.calls.append(kwargs)
        return self._handler(**kwargs)


class ExtractDeltaTextTests(unittest.TestCase):
    def test_word_boundary_prefix_prevents_mid_word_split(self):
        self.assertEqual(
            cb.extract_delta_text("data structure", "data structures and algorithms"),
            "data structures and algorithms",
        )
        self.assertEqual(
            cb.extract_delta_text("we", "we're going forward"),
            "we're going forward",
        )
        self.assertEqual(
            cb.extract_delta_text("Hello world.", "Hello world. Next topic"),
            "Next topic",
        )

    def test_strips_extended_leading_punctuation(self):
        self.assertEqual(
            cb.extract_delta_text("Hello world", "Hello world: — next point"),
            "next point",
        )

    def test_bounded_token_containment_avoids_false_substring_drops(self):
        acc = "We will talk about another topic next."
        self.assertEqual(cb.extract_delta_text(acc, "Other"), "Other")
        self.assertEqual(cb.extract_delta_text(acc, "The"), "The")
        self.assertEqual(cb.extract_delta_text(acc, "another topic next."), "")

        # After >50 intervening tokens, an earlier phrase is no longer suppressed
        filler = " ".join(f"word{i}" for i in range(55))
        long_acc = f"{acc} {filler}"
        self.assertEqual(
            cb.extract_delta_text(long_acc, "We will talk about another topic next."),
            "We will talk about another topic next.",
        )

    def test_requires_two_non_empty_tokens_for_overlap(self):
        # Single-word sentence boundary ("today." -> "Today we...") must NOT strip "Today"
        self.assertEqual(
            cb.extract_delta_text(
                "Welcome to the lecture on distributed systems today.",
                "Today we talk about neural networks.",
            ),
            "Today we talk about neural networks.",
        )
        # Empty-norm punctuation tokens must not falsely align
        self.assertEqual(
            cb.extract_delta_text("Hello world —", "... how are you."),
            "... how are you.",
        )
        # Rolling window overlap >= 2 words still trims cleanly
        self.assertEqual(
            cb.extract_delta_text(
                "one two three four five six seven eight nine ten",
                "six seven eight nine ten eleven twelve thirteen",
            ),
            "eleven twelve thirteen",
        )

    def test_unscrolled_rolling_bubble_with_earlier_edits_does_not_repeat(self):
        acc1 = (
            "Okay, picking up where we left off. We're kind of at the tail end of some of the "
            "protection stuff that that I was talking about. So again, um, the files themselves, "
            "and we'll talk more about that as the day goes on about what they look like in "
            "internally, but from the representation of what a file owner can can do what they can "
            "cannot do things by that. So that's what's stored inside the the file node it"
        )
        inc1 = (
            "Okay, picking up where we left off. We're kind of at the tail end of some of the "
            "protection stuff that that I was talking about. So again, um, the files themselves, "
            "and we'll talk more about that as the day goes on about what they look like in "
            "internally, but from the representation of what a file owner can can do what they can "
            "cannot do things by that. So, that's what's stored inside the the file node itself, "
            "and then from the the design perspective we talk about things like, read, write, "
            "execute, append, delete list"
        )
        delta1 = cb.extract_delta_text(acc1, inc1)
        self.assertEqual(
            delta1,
            "and then from the the design perspective we talk about things like, read, write, execute, append, delete list",
        )

        # Next update keeps bubble start, cleans "in internally" -> "internally" & "things, like,"
        acc2 = f"{acc1} {delta1}"
        inc2 = (
            "Okay, picking up where we left off. We're kind of at the tail end of some of the "
            "protection stuff that that I was talking about. So again, um, the files themselves, "
            "and we'll talk more about that as the day goes on about what they look like internally, "
            "but from the representation of what a file owner can can do what they can cannot do "
            "things by that. So that's what's stored inside the file node itself, and then from the "
            "the design perspective we talk about things, like, read, write, execute, append, delete, "
            "list, access that you can actually, um."
        )
        self.assertEqual(cb.extract_delta_text(acc2, inc2), "access that you can actually, um.")

        # Also works when stutter "the the" collapses simultaneously with "it" -> "itself"
        inc1_collapsed = inc1.replace("stored inside the the file node itself", "stored inside the file node itself")
        self.assertEqual(cb.extract_delta_text(acc1, inc1_collapsed), delta1)

    def test_interior_common_phrase_does_not_falsely_clip_new_sentence(self):
        acc = "First lecture topic finished when we look at files and so on."
        inc = "When a directory moves and so on, we update the parent pointer."
        self.assertEqual(cb.extract_delta_text(acc, inc), inc)

    def test_normalized_prefix_handles_comma_edit_in_committed_history(self):
        self.assertEqual(
            cb.extract_delta_text(
                "First part of the sentence",
                "First part, of the sentence continues here.",
            ),
            "continues here.",
        )


class CaptionStreamTrackerTests(unittest.TestCase):
    def test_unpunctuated_updates_do_not_crash_and_revise_cleanly(self):
        tracker = cb.CaptionStreamTracker(pause_seconds=1.5)

        e1 = tracker.process("Today we are going to discuss distributed sys", now=10.0)
        self.assertIsNotNone(e1)
        self.assertFalse(e1["isFinal"])
        self.assertEqual(e1["delta"], "Today we are going to discuss distributed sys")
        self.assertEqual(tracker.accumulated, "")

        # ASR revises 8th word and beyond without premature lock or mid-word split
        e2 = tracker.process("Today we are going to discuss distributed systems", now=10.2)
        self.assertIsNotNone(e2)
        self.assertFalse(e2["isFinal"])
        self.assertEqual(e2["delta"], "Today we are going to discuss distributed systems")
        self.assertEqual(tracker.accumulated, "")

        # Sentence-ending punctuation commits clean full sentence
        e3 = tracker.process("Today we are going to discuss distributed systems now.", now=10.5)
        self.assertIsNotNone(e3)
        self.assertTrue(e3["isFinal"])
        self.assertEqual(e3["delta"], "Today we are going to discuss distributed systems now.")
        self.assertEqual(tracker.accumulated, "Today we are going to discuss distributed systems now.")
        self.assertEqual(tracker.pending_delta, "")

    def test_semicolon_colon_emdash_do_not_commit_prematurely(self):
        tracker = cb.CaptionStreamTracker(pause_seconds=1.5)
        for text in ("Meeting starts at 10:", "Wait —", "First part;"):
            ev = tracker.process(text, now=1.0)
            self.assertIsNotNone(ev)
            self.assertFalse(ev["isFinal"], f"Should stay interim for {text!r}")

    def test_pause_flush_and_detach_flush(self):
        tracker = cb.CaptionStreamTracker(pause_seconds=1.5)
        e1 = tracker.process("Unpunctuated trailing thought", now=20.0)
        self.assertFalse(e1["isFinal"])

        # Below pause threshold -> nothing emitted
        self.assertIsNone(tracker.process("Unpunctuated trailing thought", now=21.2))
        # At >= 1.5s -> commits pending_delta
        e_pause = tracker.process("Unpunctuated trailing thought", now=21.5)
        self.assertIsNotNone(e_pause)
        self.assertTrue(e_pause["isFinal"])
        self.assertEqual(e_pause["delta"], "Unpunctuated trailing thought")
        self.assertEqual(tracker.accumulated, "Unpunctuated trailing thought")

        # Detach flush commits pending chunk
        tracker.process("Final words before hide", now=25.0)
        flushed = tracker.flush_pending(now=25.6)
        self.assertIsNotNone(flushed)
        self.assertTrue(flushed["isFinal"])
        self.assertEqual(flushed["delta"], "Final words before hide")
        self.assertIsNone(tracker.flush_pending(now=25.7))

    def test_empty_delta_clears_stale_pending_delta(self):
        tracker = cb.CaptionStreamTracker(pause_seconds=1.5)
        tracker.process("First sentence.", now=1.0)
        tracker.process("First sentence. Second clause", now=2.0)
        self.assertEqual(tracker.pending_delta, "Second clause")

        # Retraction back to already-committed prefix yields empty delta and clears pending_delta
        self.assertIsNone(tracker.process("First sentence.", now=2.2))
        self.assertEqual(tracker.pending_delta, "")
        self.assertIsNone(tracker.process("First sentence.", now=4.0))

    def test_default_pause_avoids_mid_sentence_chop_and_splits_completed_sentences(self):
        tracker = cb.CaptionStreamTracker()
        self.assertGreaterEqual(tracker.pause_seconds, 4.0)

        # Multi-sentence poll ending mid-sentence commits completed sentence & keeps trailing clause interim
        poll1 = (
            "Okay, picking up where we left off. We're kind of at the tail end of some of the "
            "protection stuff that that I was talking about. So again, um, the files themselves "
            "and what they look like in internally"
        )
        events1 = tracker.process_events(poll1, now=10.0)
        self.assertEqual(len(events1), 2)
        self.assertTrue(events1[0]["isFinal"])
        self.assertIn("talking about.", events1[0]["delta"])
        self.assertFalse(events1[1]["isFinal"])
        self.assertEqual(
            events1[1]["delta"],
            "So again, um, the files themselves and what they look like in internally",
        )

        # 2.0s breathing pause (< 4.0s default) must NOT chop mid-sentence
        self.assertEqual(tracker.process_events(poll1, now=12.0), [])

        # Completing sentence after earlier comma/typo revision commits ONLY newly finished sentence
        poll2 = (
            "Okay, picking up where we left off. We're kind of at the tail end of some of the "
            "protection stuff that that I was talking about. So again, um, the files themselves "
            "and what they look like internally, from the representation of what a file owner can do."
        )
        events2 = tracker.process_events(poll2, now=12.4)
        self.assertEqual(len(events2), 1)
        self.assertTrue(events2[0]["isFinal"])
        self.assertFalse(events2[0]["delta"].startswith("Okay, picking up"))
        self.assertEqual(
            events2[0]["delta"],
            "So again, um, the files themselves and what they look like internally, from the representation of what a file owner can do.",
        )

        # Next unpunctuated sentence only flushes after full >= 4.0s silence
        poll3 = f"{poll2} Provide either controls to keep certain"
        events3 = tracker.process_events(poll3, now=13.0)
        self.assertEqual(len(events3), 1)
        self.assertFalse(events3[0]["isFinal"])
        self.assertEqual(tracker.process_events(poll3, now=15.0), [])
        flushed = tracker.process_events(poll3, now=17.0)
        self.assertEqual(len(flushed), 1)
        self.assertTrue(flushed[0]["isFinal"])
        self.assertEqual(flushed[0]["delta"], "Provide either controls to keep certain")


class FindLiveCaptionTextTests(unittest.TestCase):
    def test_excludes_browser_windows_and_never_searches_generic_caption_keyword(self):
        def handler(**kwargs):
            # Browser tab with "Live Caption" in title must be ignored
            if kwargs.get("ClassName") == "Chrome_WidgetWin_1" and kwargs.get("SubName") == "Live Caption":
                return FakeControl(
                    exists=True,
                    name="Live Caption Tutorial - Google Chrome",
                    doc=FakeControl(exists=True, name="Live Caption Tutorial - YouTube"),
                )
            if kwargs.get("SubName") == "Live Caption":
                return FakeControl(
                    exists=True,
                    name="Live Caption Tutorial - Google Chrome",
                    doc=FakeControl(exists=True, name="Live Caption Tutorial - YouTube"),
                )
            return FakeControl(exists=False)

        fake_auto = FakeAuto(handler)
        with patch.object(cb, "auto", fake_auto):
            text, source = cb.find_live_caption_text()

        self.assertIsNone(text)
        self.assertIsNone(source)
        subnames = [c.get("SubName") for c in fake_auto.calls]
        self.assertNotIn("Caption", subnames)
        self.assertIn("Live Caption", subnames)
        self.assertIn("Live Captions", subnames)

    def test_document_control_allows_spoken_words_while_children_filter_ui_buttons(self):
        def handler(**kwargs):
            if kwargs.get("ClassName") == "Chrome_WidgetWin_1" and kwargs.get("SubName") == "Live Caption":
                return FakeControl(
                    exists=True,
                    name="Live Caption",
                    doc=FakeControl(exists=True, name="Close"),
                )
            return FakeControl(exists=False)

        with patch.object(cb, "auto", FakeAuto(handler)):
            text, source = cb.find_live_caption_text()
        self.assertEqual((text, source), ("Close", "Chrome Live Caption"))

        # When DocumentControl is empty, GetChildren ignores ButtonControls and IGNORE_NAMES
        def child_handler(**kwargs):
            if kwargs.get("ClassName") == "Chrome_WidgetWin_1" and kwargs.get("SubName") == "Live Caption":
                return FakeControl(
                    exists=True,
                    name="Live Caption",
                    doc=FakeControl(exists=True, name=""),
                    children=[
                        FakeControl(name="Expand", control_type="ButtonControl"),
                        FakeControl(name="Back to tab", control_type="TextControl"),
                        FakeControl(name="Close", control_type="ButtonControl"),
                        FakeControl(name="Actual caption text", control_type="TextControl"),
                    ],
                )
            return FakeControl(exists=False)

        with patch.object(cb, "auto", FakeAuto(child_handler)):
            text2, source2 = cb.find_live_caption_text()
        self.assertEqual((text2, source2), ("Actual caption text", "Chrome Live Caption"))

    def test_win11_live_captions_filters_ignore_names(self):
        def handler(**kwargs):
            if kwargs.get("ClassName") == "LiveCaptionDesktopWindow":
                return FakeControl(
                    exists=True,
                    name="Live captions",
                    children=[
                        FakeControl(name="Settings", control_type="TextControl"),
                        FakeControl(name="Windows speech transcript", control_type="TextControl"),
                    ],
                )
            return FakeControl(exists=False)

        with patch.object(cb, "auto", FakeAuto(handler)):
            text, source = cb.find_live_caption_text()
        self.assertEqual((text, source), ("Windows speech transcript", "Windows Live Captions"))


if __name__ == "__main__":
    unittest.main()
