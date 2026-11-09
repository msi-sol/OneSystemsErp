/**
 * The message to show for a failed backend call. Backend routes answer `{ error: "…" }`; server actions used to
 * throw `Backend Error: 500 {"success":false,"error":"…"}`, which put raw JSON (and sometimes database query
 * text) on screen. This returns the backend's own message, or a plain fallback.
 */
export function backendErrorMessage(status: number, bodyText: string): string {
  try {
    const body = JSON.parse(bodyText);
    const message = typeof body?.error === 'string' ? body.error : typeof body?.message === 'string' ? body.message : '';
    // Database errors carry query text and file paths; never show those.
    if (message && !/prisma|invocation|\.ts:\d+/i.test(message)) return message;
  } catch {
    // Not JSON (e.g. an HTML error page).
  }
  if (status === 401) return 'Your session has expired. Sign in and try again.';
  if (status === 403) return 'You do not have permission to do this.';
  if (status === 404) return 'The record was not found. Refresh the page and try again.';
  return `The request failed (${status}). Try again; if it keeps failing, contact your administrator.`;
}
