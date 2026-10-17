import type { TranscriptSegment } from './messaging';

const API_KEY_STORAGE_KEY = 'gemini_api_key';
const MODEL_STORAGE_KEY = 'gemini_model';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

const memoryFallbackStore: Record<string, string> = {};

export async function saveGeminiApiKey(apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: trimmed });
  } else {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
      }
    } catch {
      // Ignore if localStorage unavailable
    }
    memoryFallbackStore[API_KEY_STORAGE_KEY] = trimmed;
  }
}

export async function getGeminiApiKey(): Promise<string> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
    return (result[API_KEY_STORAGE_KEY] as string) || '';
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (val !== null && val !== undefined) return val;
    }
  } catch {
    // Ignore if localStorage unavailable
  }
  return memoryFallbackStore[API_KEY_STORAGE_KEY] || '';
}

export async function saveGeminiModel(model: string): Promise<void> {
  const trimmed = model.trim() || DEFAULT_GEMINI_MODEL;
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [MODEL_STORAGE_KEY]: trimmed });
  } else {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MODEL_STORAGE_KEY, trimmed);
      }
    } catch {
      // Ignore if localStorage unavailable
    }
    memoryFallbackStore[MODEL_STORAGE_KEY] = trimmed;
  }
}

export async function getGeminiModel(): Promise<string> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get(MODEL_STORAGE_KEY);
    return (result[MODEL_STORAGE_KEY] as string) || DEFAULT_GEMINI_MODEL;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(MODEL_STORAGE_KEY);
      if (val) return val;
    }
  } catch {
    // Ignore if localStorage unavailable
  }
  return memoryFallbackStore[MODEL_STORAGE_KEY] || DEFAULT_GEMINI_MODEL;
}

// Low-level direct REST caller with fallback for guaranteed browser extension execution
async function callGeminiRest(
  apiKey: string,
  model: string,
  payload: Record<string, unknown>
): Promise<string> {
  const targetModel = model.trim() || DEFAULT_GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    // Resilient fallback: If an older model returns 404 (e.g. gemini-2.5-flash deprecated) and isn't the default, auto-fallback to gemini-3.8-flash
    if (res.status === 404 && targetModel !== DEFAULT_GEMINI_MODEL) {
      console.warn(`Model ${targetModel} returned 404. Auto-retrying with ${DEFAULT_GEMINI_MODEL}...`);
      return await callGeminiRest(apiKey, DEFAULT_GEMINI_MODEL, payload);
    }
    throw new Error(`Gemini API Error (${res.status}): ${errorBody}`);
  }

  const json = await res.json();
  const text =
    json?.candidates?.[0]?.content?.parts?.[0]?.text ||
    json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join('') ||
    '';
  return text;
}

export async function summarizeTranscriptToMarkdown(params: {
  apiKey: string;
  model?: string;
  pageTitle: string;
  pageUrl: string;
  segments: TranscriptSegment[];
}): Promise<string> {
  const { apiKey, model, pageTitle, pageUrl, segments } = params;
  const effectiveModel = model || (await getGeminiModel());

  const formattedTranscript = segments
    .map((s) => `[${s.formattedTime} | ${Math.floor(s.startTime)}s] ${s.text}`)
    .join('\n');

  const prompt = `
You are an expert technical note-taking assistant. Convert the following video transcript into structured, concise Obsidian Markdown study notes.

Video Title: ${pageTitle}
Video URL: ${pageUrl}

Requirements:
1. Start with an Overview section summarizing the video in 2-3 concise sentences.
2. Group the content into distinct logical topics under ## headings.
3. Include clickable Markdown timestamp links in the format [MM:SS](${pageUrl}#t=SECONDSs) next to key concepts using the exact SECONDS value from the transcript.
4. Extract any code snippets, formulas, or key definitions into fenced code blocks or Obsidian callouts (e.g. > [!important], > [!tip]).
5. Provide a Key Takeaways bulleted list at the end.

Transcript:
${formattedTranscript}
`.trim();

  return await callGeminiRest(apiKey, effectiveModel, {
    contents: [{ parts: [{ text: prompt }] }],
  });
}

export async function analyzeVideoFrameWithGemini(params: {
  apiKey: string;
  model?: string;
  dataUrl: string;
  formattedTime: string;
  pageTitle: string;
}): Promise<string> {
  const { apiKey, model, dataUrl, formattedTime, pageTitle } = params;
  const effectiveModel = model || (await getGeminiModel());

  const [header, base64Data] = dataUrl.split(',');
  const mimeMatch = header?.match(/data:(.*?);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/webp';

  const prompt = `
You are a technical study assistant analyzing a high-resolution video frame captured at ${formattedTime} from "${pageTitle}".

Requirements:
1. If source code is shown, transcribe it accurately into a properly tagged Markdown fenced code block (e.g. \`\`\`python, \`\`\`typescript).
2. If an architecture diagram, flow chart, graph, or slide layout is visible, summarize its key components and relationships clearly.
3. If mathematical equations or formulas are visible, transcribe them into LaTeX format ($...$ or $$...$$).
4. Provide a concise explanation formatted for an Obsidian note callout.
`.trim();

  return await callGeminiRest(apiKey, effectiveModel, {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
          { text: prompt },
        ],
      },
    ],
  });
}

export async function askAIAboutVideo(params: {
  apiKey: string;
  model?: string;
  userQuestion: string;
  pageTitle: string;
  pageUrl: string;
  activeFrameDataUrl?: string;
  notesContext?: string;
}): Promise<string> {
  const { apiKey, model, userQuestion, pageTitle, pageUrl, activeFrameDataUrl, notesContext } = params;
  const effectiveModel = model || (await getGeminiModel());

  const parts: Array<Record<string, unknown>> = [];

  if (activeFrameDataUrl) {
    const [header, base64Data] = activeFrameDataUrl.split(',');
    const mimeMatch = header?.match(/data:(.*?);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/webp';

    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: base64Data,
      },
    });
  }

  const promptText = `
Context:
- Video Title: ${pageTitle}
- Video URL: ${pageUrl}
${notesContext ? `- Current User Notes:\n${notesContext}` : ''}

User Question:
${userQuestion}

Answer the question clearly and informatively, using Markdown formatting with code blocks or callouts where helpful.
`.trim();

  parts.push({ text: promptText });

  return await callGeminiRest(apiKey, effectiveModel, {
    contents: [{ parts }],
  });
}
