jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('openai', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: { auditLog: { create: jest.fn().mockResolvedValue({}) } } }));
import OpenAI from 'openai';
import { z } from 'zod';
import { askUploadHelper } from '@/lib/boq/workspace-upload-ai';
import { prisma } from '@/lib/prisma';

describe('OpenAI upload helper boundary', () => {
  const before = process.env.OPENAI_API_KEY;
  const create = jest.fn();
  const input = { schema: z.object({ value: z.number() }).strict(), name: 'test_upload', instructions: 'Read source data only', content: [{ type: 'input_text' as const, text: 'Synthetic local test' }], context: 'boq:reviewer:new', fileHash: 'a'.repeat(64) };
  beforeEach(() => {
    jest.clearAllMocks(); process.env.OPENAI_API_KEY = 'test-key-not-a-real-credential';
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({ responses: { create } }));
    create.mockResolvedValue({ status: 'completed', output_text: '{"value":70}' });
  });
  afterAll(() => { if (before === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before; });
  it('uses strict structured output, disables response storage and audits only source identity', async () => {
    await expect(askUploadHelper(input)).resolves.toEqual({ value: 70 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ store: false, text: { format: expect.objectContaining({ type: 'json_schema', strict: true }) } }));
    expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0, timeout: 60000 }));
    const logs = JSON.stringify((prisma.auditLog.create as jest.Mock).mock.calls);
    expect(logs).toContain('UPLOAD_AI_HELPER_COMPLETED'); expect(logs).not.toContain('test-key'); expect(logs).not.toContain('Synthetic local test');
  });
  it('does not call a provider without a key or authorized context', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(askUploadHelper(input)).rejects.toThrow('not configured');
    process.env.OPENAI_API_KEY = 'test-key';
    await expect(askUploadHelper({ ...input, context: 'unscoped' })).rejects.toThrow('authorized project');
    expect(OpenAI).not.toHaveBeenCalled();
  });
  it('rejects truncated or invalid output and hides provider diagnostics', async () => {
    create.mockResolvedValueOnce({ status: 'incomplete', output_text: '{"value":70}' });
    await expect(askUploadHelper(input)).rejects.toThrow('complete reading');
    create.mockResolvedValueOnce({ status: 'completed', output_text: '{"wrong":70}' });
    await expect(askUploadHelper(input)).rejects.toThrow('valid complete reading');
    create.mockRejectedValueOnce(new Error('private document contents and provider credentials'));
    await expect(askUploadHelper(input)).rejects.toThrow('failed or timed out');
  });
  it('reports key or quota configuration failures without exposing provider messages', async () => {
    create.mockRejectedValueOnce({ status: 401, code: 'invalid_api_key', message: 'private provider diagnostic' });
    await expect(askUploadHelper(input)).rejects.toThrow('key was not accepted');
    create.mockRejectedValueOnce({ status: 429, code: 'insufficient_quota', message: 'private account diagnostic' });
    await expect(askUploadHelper(input)).rejects.toThrow('no available API quota');
  });
});
