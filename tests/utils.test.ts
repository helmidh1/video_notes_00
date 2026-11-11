import { describe, it, expect } from 'vitest';
import { formatSeconds, parseTimeStringToSeconds, extractDeltaText } from '../utils/transcriptExtractor';
import { generateTemplate } from '../utils/templates';
import { generateObsidianFrontmatter } from '../utils/vaultStorage';
import {
  normalizeCaptionUrl,
  mergeRollingPendingText,
  reconcileBridgeDeltaWithSafetyCommit,
} from '../entrypoints/sidepanel/components/LiveCaptionsTab';

describe('Transcript Formatting & Parsing', () => {
  it('formats seconds into MM:SS format', () => {
    expect(formatSeconds(0)).toBe('00:00');
    expect(formatSeconds(75)).toBe('01:15');
    expect(formatSeconds(3599)).toBe('59:59');
  });

  it('formats seconds into HH:MM:SS format when over 1 hour', () => {
    expect(formatSeconds(3600)).toBe('1:00:00');
    expect(formatSeconds(3665)).toBe('1:01:05');
  });

  it('parses MM:SS time strings back into seconds', () => {
    expect(parseTimeStringToSeconds('00:00')).toBe(0);
    expect(parseTimeStringToSeconds('01:15')).toBe(75);
    expect(parseTimeStringToSeconds('59:59')).toBe(3599);
  });

  it('parses HH:MM:SS time strings back into seconds', () => {
    expect(parseTimeStringToSeconds('1:00:00')).toBe(3600);
    expect(parseTimeStringToSeconds('01:01:05')).toBe(3665);
  });
});

describe('Template Generation', () => {
  it('generates a standard template with frontmatter', () => {
    const output = generateTemplate({
      type: 'standard',
      title: 'Machine Learning 101',
      sourceUrl: 'https://youtube.com/watch?v=123',
    });
    expect(output).toContain('title: "Machine Learning 101"');
    expect(output).toContain('https://youtube.com/watch?v=123');
    expect(output).toContain('# Machine Learning 101');
  });

  it('generates a Cornell note template with cues and summary', () => {
    const output = generateTemplate({
      type: 'cornell',
      title: 'Operating Systems',
    });
    expect(output).toContain('## 🎯 Cues & Questions');
    expect(output).toContain('## 📝 Lecture Notes');
    expect(output).toContain('## 💡 Summary (Bottom Line)');
    expect(output).toContain('> [!abstract] Key Takeaway');
  });

  it('generates an Obsidian flashcards deck template', () => {
    const output = generateTemplate({
      type: 'flashcards',
      title: 'Distributed Systems',
    });
    expect(output).toContain('TARGET DECK: VideoStudyNotes');
    expect(output).toContain('Question 1::Answer 1');
  });
});

describe('Obsidian Vault Storage Utilities', () => {
  it('generates clean YAML frontmatter with tags', () => {
    const fm = generateObsidianFrontmatter({
      title: 'Deep Learning',
      sourceUrl: 'https://youtu.be/xyz',
      tags: ['ai', 'neural-networks'],
    });
    expect(fm).toContain('title: "Deep Learning"');
    expect(fm).toContain('source: "https://youtu.be/xyz"');
    expect(fm).toContain('- ai');
    expect(fm).toContain('- neural-networks');
    expect(fm.startsWith('---')).toBe(true);
  });
});

describe('Gemini Model Configuration', () => {
  it('defaults to gemini-3.8-flash', async () => {
    const { DEFAULT_GEMINI_MODEL, getGeminiModel, saveGeminiModel } = await import('../utils/geminiClient');
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.8-flash');
    const model = await getGeminiModel();
    expect(model).toBe('gemini-3.8-flash');
  });

  it('allows saving and retrieving custom model', async () => {
    const { getGeminiModel, saveGeminiModel } = await import('../utils/geminiClient');
    await saveGeminiModel('gemini-3.8-pro');
    expect(await getGeminiModel()).toBe('gemini-3.8-pro');
    await saveGeminiModel('gemini-3.8-flash');
  });
});

describe('Live Captions Integration', () => {
  it('correctly associates time stamps with caption segments', () => {
    const timeInSec = 92;
    const formatted = formatSeconds(timeInSec);
    expect(formatted).toBe('01:32');
    const markdownLine = `- [${formatted}](https://example.com/video#t=${timeInSec}s) Real-time caption text`;
    expect(markdownLine).toBe('- [01:32](https://example.com/video#t=92s) Real-time caption text');
  });

  it('correctly parses Canvas LMS video timestamps and formats them', () => {
    expect(parseTimeStringToSeconds('04:15')).toBe(255);
    expect(parseTimeStringToSeconds('1:22:10')).toBe(4930);
    expect(formatSeconds(255)).toBe('04:15');
    expect(formatSeconds(4930)).toBe('1:22:10');
  });

  it('extracts only newly spoken delta without rewriting prior text', () => {
    const chunk1 = "Recording I? All right. So, yeah, we're going to be talking about the Cyber bit range that we'll be using in our classes.";
    const chunk2 = `${chunk1} Hello, hello, and welcome. We're just getting started.`;
    const chunk3 = `${chunk2} So, if we go to the next slide, we'll talk about access.`;

    // First entry: no prior text
    const delta1 = extractDeltaText('', chunk1);
    expect(delta1).toBe(chunk1);

    // Second entry: should only return sentence 2
    const delta2 = extractDeltaText(chunk1, chunk2);
    expect(delta2).toBe("Hello, hello, and welcome. We're just getting started.");

    // Third entry: should only return sentence 3
    const accumulated = `${chunk1} ${delta2}`;
    const delta3 = extractDeltaText(accumulated, chunk3);
    expect(delta3).toBe("So, if we go to the next slide, we'll talk about access.");

    // Identical entry: should return empty string
    const deltaDup = extractDeltaText(chunk3, chunk3);
    expect(deltaDup).toBe('');
  });

  it('handles rolling window buffers where oldest words scroll off', () => {
    const accumulated = "one two three four five six seven eight nine ten";
    const rollingIncoming = "six seven eight nine ten eleven twelve thirteen";

    const delta = extractDeltaText(accumulated, rollingIncoming);
    expect(delta).toBe("eleven twelve thirteen");
  });

  it('supports in-browser speech recognition caption items', () => {
    const item = {
      id: 'item-1',
      text: 'Explaining the backpropagation algorithm step by step.',
      timestamp: 145,
      formattedTime: formatSeconds(145),
      isFinal: true,
      source: 'speech-recognition' as const,
    };

    expect(item.source).toBe('speech-recognition');
    expect(item.formattedTime).toBe('02:25');
    const markdown = `- [${item.formattedTime}](https://youtube.com/watch?v=abc#t=${item.timestamp}s) ${item.text}`;
    expect(markdown).toBe('- [02:25](https://youtube.com/watch?v=abc#t=145s) Explaining the backpropagation algorithm step by step.');
  });

  it('normalizes video URLs by stripping fragments and timestamp query parameters', () => {
    expect(normalizeCaptionUrl('https://youtube.com/watch?v=abc&t=42s#t=42s')).toBe(
      'https://youtube.com/watch?v=abc'
    );
    expect(normalizeCaptionUrl('https://youtu.be/xyz?t=15')).toBe('https://youtu.be/xyz');
  });

  it('extractDeltaText respects word boundaries, single-token guards, and overlap stitching', () => {
    // Word-boundary prefix guard: "car" must not truncate "cartoon" -> "toon"
    expect(extractDeltaText('car', 'cartoon')).toBe('cartoon');
    // Repeated non-trailing single token after punctuation is preserved
    expect(extractDeltaText('the cat sat.', 'the')).toBe('the');
    // Punctuation-only incoming text yields empty delta cleanly
    expect(extractDeltaText('hello world', '— ...')).toBe('');
    // Word-boundary prefix match strips leading separator punctuation
    expect(extractDeltaText('First sentence', 'First sentence, second clause')).toBe('second clause');
    // Suffix-prefix overlap (>= 2 tokens) preserves tail cleanly
    expect(extractDeltaText('welcome to the neural', 'the neural network course')).toBe('network course');

    // Normalized prefix match survives comma insertion inside prior text
    expect(
      extractDeltaText('First part of the sentence', 'First part, of the sentence continues here.')
    ).toBe('continues here.');

    // Un-scrolled rolling bubble with earlier edits and tail seam revision does not repeat history
    const acc1 =
      "Okay, picking up where we left off. We're kind of at the tail end of some of the " +
      'protection stuff that that I was talking about. So again, um, the files themselves, ' +
      "and we'll talk more about that as the day goes on about what they look like in " +
      'internally, but from the representation of what a file owner can can do what they can ' +
      "cannot do things by that. So that's what's stored inside the the file node it";
    const inc1 =
      "Okay, picking up where we left off. We're kind of at the tail end of some of the " +
      'protection stuff that that I was talking about. So again, um, the files themselves, ' +
      "and we'll talk more about that as the day goes on about what they look like in " +
      'internally, but from the representation of what a file owner can can do what they can ' +
      "cannot do things by that. So, that's what's stored inside the file node itself, " +
      'and then from the design perspective we talk about things like, read, write.';
    const delta1 = extractDeltaText(acc1, inc1);
    expect(delta1).toBe('and then from the design perspective we talk about things like, read, write.');

    // Follow-up bubble cleaning "in internally" -> "internally" still anchors at "read, write."
    const acc2 = `${acc1} ${delta1}`;
    const inc2 = inc1.replace('in internally', 'internally') + ' Next controls apply.';
    expect(extractDeltaText(acc2, inc2)).toBe('Next controls apply.');

    // Interior common filler in an unrelated sentence must not falsely clip the start
    const accOther = 'First lecture topic finished when we look at files and so on.';
    const incOther = 'When a directory moves and so on, we update the parent pointer.';
    expect(extractDeltaText(accOther, incOther)).toBe(incOther);
  });

  it('mergeRollingPendingText extends, revises, and stitches rolling cues without dropping words', () => {
    // 1. Prefix extension keeps single continuing buffer
    expect(mergeRollingPendingText('Welcome to', 'Welcome to the course')).toEqual({
      merged: 'Welcome to the course',
      flushedPrefix: '',
      isContinuation: true,
    });

    // 2. In-place ASR stem completion replaces partial last word cleanly
    expect(mergeRollingPendingText('we are training neur', 'we are training neural networks')).toEqual({
      merged: 'we are training neural networks',
      flushedPrefix: '',
      isContinuation: true,
    });

    // 3. Rolling window overlap stitches incoming suffix
    expect(mergeRollingPendingText('alpha beta gamma delta', 'gamma delta epsilon zeta')).toEqual({
      merged: 'alpha beta gamma delta epsilon zeta',
      flushedPrefix: '',
      isContinuation: true,
    });

    // 4. Distinct non-overlapping cue flushes prior cue before buffering the new one
    expect(mergeRollingPendingText('First complete thought', 'Totally different topic')).toEqual({
      merged: 'Totally different topic',
      flushedPrefix: 'First complete thought',
      isContinuation: false,
    });

    // 5. Long unpunctuated stream (>= 20 scrolled-off words before overlap) flushes stable prefix
    const prefix20 = Array.from({ length: 20 }, (_, i) => `word${i + 1}`).join(' ');
    const longRes = mergeRollingPendingText(`${prefix20} tail one`, 'tail one next part');
    expect(longRes.flushedPrefix).toBe(prefix20);
    expect(longRes.merged).toBe('tail one next part');
    expect(longRes.isContinuation).toBe(true);
  });

  it('reconcileBridgeDeltaWithSafetyCommit strips early safety-flushed prefixes without dropping unrelated sentences', () => {
    // 1. Exact duplicate of safety-committed phrase yields empty
    expect(reconcileBridgeDeltaWithSafetyCommit('hello world', 'hello world')).toBe('');

    // 2. Final bridge segment extending safety-committed prefix returns only remaining suffix
    expect(
      reconcileBridgeDeltaWithSafetyCommit('hello world this is great.', 'hello world')
    ).toBe('this is great.');

    // 3. Tail stem ASR correction after safety commit avoids duplicating earlier words
    expect(
      reconcileBridgeDeltaWithSafetyCommit('we are training neural networks.', 'we are train')
    ).toBe('training neural networks.');

    // 4. Unrelated new final sentence is preserved completely
    expect(
      reconcileBridgeDeltaWithSafetyCommit('Next topic begins here.', 'hello world')
    ).toBe('Next topic begins here.');
  });
});

