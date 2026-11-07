import { readWorkspaceResponse } from '@/lib/boq/workspace-response';

describe('BOQ workspace response parsing', () => {
  it.each([
    [413, /too large.*smaller supported source file.*10 MiB/i],
    [502, /temporarily unavailable/i],
    [503, /temporarily unavailable/i],
    [504, /temporarily unavailable/i],
  ])('turns an HTML %s response into actionable text', async (status, expected) => {
    const response = new Response('<!DOCTYPE html><html><body>gateway details</body></html>', {
      status, headers: { 'Content-Type': 'text/html' },
    });
    const caught = await readWorkspaceResponse(response, 'analyze').catch(error => error);
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toMatch(expected);
    expect(caught.message).not.toMatch(/DOCTYPE|gateway details|Unexpected token/i);
  });

  it('handles a followed login redirect without exposing the page body', async () => {
    const response = new Response('<!DOCTYPE html><title>Sign in</title>', { status: 200 });
    Object.defineProperties(response, {
      redirected: { value: true },
      url: { value: 'http://localhost/login' },
    });
    await expect(readWorkspaceResponse(response, 'confirm')).rejects.toThrow(/session may have expired.*sign in again/i);
  });

  it('returns valid JSON so application-level failures remain visible to the caller', async () => {
    const response = Response.json({ success: false, error: 'Choose a different sheet before confirming.' });
    await expect(readWorkspaceResponse(response, 'confirm')).resolves.toEqual({
      success: false,
      error: 'Choose a different sheet before confirming.',
    });
  });

  it('rejects a success response missing the analyzed payload', async () => {
    const response = Response.json({ success: true });
    await expect(readWorkspaceResponse(response, 'analyze')).rejects.toThrow(/could not be analyzed/i);
  });

  it('rejects a success response missing required confirm fields', async () => {
    const response = Response.json({ success: true, uploadId: 'upload-1', projectId: 'project-1', status: 'DRAFT' });
    await expect(readWorkspaceResponse(response, 'confirm')).rejects.toThrow(/draft could not be saved/i);
  });

  it('returns a complete confirm payload with required fields narrowed', async () => {
    const response = Response.json({
      success: true, uploadId: 'upload-1', projectId: 'project-1', status: 'DRAFT',
      report: { fileUrl: '/source', grandTotal: 25, validRowsCount: 1, warningRowsCount: 0, errorRowsCount: 0 },
    });
    await expect(readWorkspaceResponse(response, 'confirm')).resolves.toMatchObject({
      success: true, uploadId: 'upload-1', projectId: 'project-1',
      report: { grandTotal: 25, validRowsCount: 1 },
    });
  });

  it('preserves a useful JSON error for a non-success HTTP response', async () => {
    const response = Response.json({ success: false, error: 'The document token expired; analyze the workbook again.' }, { status: 409 });
    await expect(readWorkspaceResponse(response, 'confirm')).rejects.toThrow(/document token expired/i);
  });

  it('uses a safe operation-specific message for malformed non-HTML data', async () => {
    const response = new Response('{not-json', { status: 200 });
    await expect(readWorkspaceResponse(response, 'confirm')).rejects.toThrow(/BOQ draft could not be saved.*file and review choices/i);
  });
});
