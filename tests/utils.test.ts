import { describe, it, expect } from 'vitest';
import { formatSeconds, parseTimeStringToSeconds, extractDeltaText } from '../utils/transcriptExtractor';
import { generateTemplate } from '../utils/templates';
import { generateObsidianFrontmatter } from '../utils/vaultStorage';

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
});

