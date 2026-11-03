'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

// Define fetchWithAuth wrapper
// This is a placeholder. In a real application, this would handle authentication tokens
// and potentially inject them into headers. For this migration, we'll assume it
// handles passing the 'session' cookie value and 'simulatedRole' as part of the request body
// for backend validation.
async function fetchWithAuth(url: string, options: RequestInit) {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const session = __session?.id || '';
  const simulatedRole = cookieStore.get('simulatedRole')?.value;

  const headers = {
    'Content-Type': 'application/json',
    // Example if backend expects a Bearer token:
    // 'Authorization': session ? `Bearer ${session}` : '',
    ...(options.headers || {}),
  };

  // Ensure userId and simulatedRole are part of the body for backend validation
  let body;
  if (options.body && typeof options.body === 'string') {
    const parsedBody = JSON.parse(options.body);
    body = JSON.stringify({ ...parsedBody, userId: session, simulatedRole });
  } else {
    body = JSON.stringify({ userId: session, simulatedRole }); // Case for empty original body
  }

  const response = await backendFetch(`${url}`, {
    ...options,
    headers,
    body,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Operation failed on backend.');
  }
  return result.data;
}

// Re-implement the original exported functions as proxies

/**
 * Retrieves all Billing records for a project to populate the Accomplishment Selector
 */
export async function getProjectBillings(projectId: string) {
  return await fetchWithAuth('/api/executiveValidationActions/getProjectBillings', {
    method: 'POST',
    body: JSON.stringify({ projectId }),
  });
}

/**
 * Fetches all validation records for a specific billing ID, grouped by module source
 */
export async function getBillingValidationMatrix(projectId: string, billingId: string) {
  return await fetchWithAuth('/api/executiveValidationActions/getBillingValidationMatrix', {
    method: 'POST',
    body: JSON.stringify({ projectId, billingId }),
  });
}

/**
 * Simulates an AI Engine processing an evidence file (e.g., photo, drone video)
 */
export async function runAIEvidenceEngine(projectId: string, evidenceType: string, fileUrl: string, moduleSource: string) {
  const record = await fetchWithAuth('/api/executiveValidationActions/runAIEvidenceEngine', {
    method: 'POST',
    body: JSON.stringify({ projectId, evidenceType, fileUrl, moduleSource }),
  });
  revalidatePath('/executive/validation');
  return record;
}

/**
 * Aggregates all validation records for a project into a single ProjectValidationScore
 */
export async function aggregateProjectValidationScore(projectId: string) {
  return await fetchWithAuth('/api/executiveValidationActions/aggregateProjectValidationScore', {
    method: 'POST',
    body: JSON.stringify({ projectId }),
  });
}
