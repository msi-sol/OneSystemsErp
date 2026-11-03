'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

// This `fetchWithAuth` function acts as a proxy to your AWS backend.
// (e.g., .env.local, .env.production) and points to your AWS Express.js API base URL.
async function fetchWithAuth(urlPath: string, options?: RequestInit) {

  const response = await backendFetch(`${urlPath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  if (!response.ok) {
    let errorDetail = 'Unknown error occurred.';
    try {
      const errorResponse = await response.json();
      errorDetail = errorResponse.error || errorResponse.message || errorDetail;
    } catch (e) {
      // If response is not JSON, use default error message
    }
    throw new Error(`Backend fetch failed: ${response.status} ${response.statusText} - ${errorDetail}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Operation failed on the server.');
  }
  return result;
}

export async function getFinancialReport() {
  // Access cookies on the server side using Next.js headers API
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  const activeProjectId = cookieStore.get('activeProjectId')?.value || null;

  // Call the AWS backend through the fetchWithAuth proxy
  const response = await fetchWithAuth('/api/reportActions/getFinancialReport', {
    method: 'POST',
    body: JSON.stringify({ sessionId, activeProjectId })
  });

  // Return the data exactly as the original function did
  return {
    projectFinancials: response.projectFinancials,
    globalOutstandingPayables: response.globalOutstandingPayables
  };
}

export async function getProjectReport() {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  const activeProjectId = cookieStore.get('activeProjectId')?.value || null;

  const response = await fetchWithAuth('/api/reportActions/getProjectReport', {
    method: 'POST',
    body: JSON.stringify({ sessionId, activeProjectId })
  });

  // The backend is expected to return { success: true, data: reportArray }
  return response.data; 
}

export async function getInventoryReport() {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  const activeProjectId = cookieStore.get('activeProjectId')?.value || null;

  const response = await fetchWithAuth('/api/reportActions/getInventoryReport', {
    method: 'POST',
    body: JSON.stringify({ sessionId, activeProjectId })
  });

  // The backend is expected to return { success: true, data: reportArray }
  return response.data;
}
