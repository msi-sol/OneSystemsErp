import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

// Single OpenAI configuration for the app's general AI features (validation, notebook, assistants,
// benchmark matching, document checks). Shared by the Next app and the AWS backend, so it must stay free
// of Next-only imports and path aliases.
//
// Model: OPENAI_MODEL, else the upload model (OPENAI_UPLOAD_MODEL), else gpt-6-luna.
// Key:   OPENAI_API_KEY (the same key the BOQ upload helper uses).

export const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';

export function openAIModelName(): string {
  return process.env.OPENAI_MODEL?.trim() || process.env.OPENAI_UPLOAD_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** An AI SDK language model for generateText / generateObject / streamText. Reads the key at call time. */
export function openAIModel(modelName: string = openAIModelName()) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OpenAI is not configured. Set OPENAI_API_KEY to enable AI features.');
  return createOpenAI({ apiKey })(modelName);
}

/**
 * Plain text generation, optionally with one attached document or image (e.g. a delivery receipt or a
 * supplier quotation), replacing the previous Gemini `generateContent([prompt, { inlineData }])` calls.
 */
export async function generateOpenAIText(input: {
  prompt: string;
  file?: { base64: string; mediaType: string; filename?: string };
}): Promise<string> {
  const model = openAIModel();
  if (!input.file) {
    const result = await generateText({ model, prompt: input.prompt });
    return result.text;
  }
  const result = await generateText({
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: input.prompt },
        { type: 'file', data: input.file.base64, mediaType: input.file.mediaType, filename: input.file.filename },
      ],
    }],
  });
  return result.text;
}
