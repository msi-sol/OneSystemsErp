import 'server-only';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ResponseInputContent } from 'openai/resources/responses/responses';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { WorkspaceError } from './workspace-types';

export async function askUploadHelper<T>(input: {
  schema: z.ZodType<T>; name: string; instructions: string; content: ResponseInputContent[];
  context: string; fileHash: string;
}): Promise<T> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new WorkspaceError('The built-in reader could not recognize this layout and the OpenAI helper is not configured. Use manual column mapping or ask your administrator to configure it.', 503);
  const scope = /^(boq|benchmark|dupa):([^:]+):([^:]+)(?::.*)?$/.exec(input.context);
  if (!scope) throw new WorkspaceError('Analyze this upload in its authorized project context.', 409);
  const model = process.env.OPENAI_UPLOAD_MODEL?.trim() || 'gpt-6-luna';
  const audit = (actionType: string) => prisma.auditLog.create({ data: {
    userId: scope[2], moduleName: 'PROJECT_MANAGEMENT', transactionId: scope[3] === 'new' ? input.fileHash : scope[3],
    actionType, newValue: JSON.stringify({ fileHash: input.fileHash, context: input.context, operation: input.name, provider: 'openai', model }),
  } });
  // Record only source identity and provider metadata, never document contents or keys.
  await audit('UPLOAD_AI_HELPER_REQUESTED');
  try {
    const client = new OpenAI({ apiKey: key, timeout: 60_000, maxRetries: 0 });
    const response = await client.responses.create({
      model, store: false, max_output_tokens: 24_000,
      instructions: input.instructions,
      input: [{ role: 'user', content: input.content }],
      text: { format: zodTextFormat(input.schema, input.name) },
    });
    if (response.status !== 'completed' || !response.output_text || response.output_text.length > 2 * 1024 * 1024) {
      throw new WorkspaceError('The AI helper did not return a complete reading. Use a smaller source or manual mapping; no data was imported.', 422);
    }
    const parsed = input.schema.safeParse(JSON.parse(response.output_text));
    if (!parsed.success) throw new WorkspaceError('The AI helper could not produce a valid complete reading. Check the original source or use manual mapping.', 422);
    await audit('UPLOAD_AI_HELPER_COMPLETED');
    return parsed.data;
  } catch (error) {
    await audit('UPLOAD_AI_HELPER_FAILED');
    if (error instanceof WorkspaceError) throw error;
    const providerError = error as { status?: unknown; code?: unknown; param?: unknown };
    const status = typeof providerError?.status === 'number' ? providerError.status : undefined;
    const code = typeof providerError?.code === 'string' && /^[a-z0-9_-]{1,80}$/i.test(providerError.code) ? providerError.code : undefined;
    const parameter = typeof providerError?.param === 'string' && /^[a-z0-9_.-]{1,120}$/i.test(providerError.param) ? providerError.param : undefined;
    console.warn('OpenAI upload helper request failed', { status, code, parameter });
    if (status === 401) throw new WorkspaceError('The OpenAI upload helper key was not accepted. Ask your administrator to check the configured key, or use manual mapping.', 503);
    if (code === 'insufficient_quota') throw new WorkspaceError('The OpenAI upload helper has no available API quota. Ask your administrator to check API billing and limits, or use manual mapping.', 503);
    throw new WorkspaceError('The OpenAI upload helper failed or timed out. Retry or use manual mapping; no data was imported.', 502);
  }
}
