'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { cookies } from 'next/headers';

// Placeholder for fetchWithAuth function
// In a real application, this would handle base URL, authentication tokens,
// error handling, and other common fetch concerns.
async function fetchWithAuth(url: string, options?: RequestInit) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options?.headers || {}),
  };
  const response = await backendFetch(`${url}`, {
    ...options,
    headers,
    // Ensure cookies are forwarded if needed by the backend for session management
    // For this specific migration, we're explicitly passing relevant cookie values in the body.
    // 'credentials': 'include' might be used for other auth patterns.
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(errorData.error || response.statusText || 'Failed to fetch data from backend');
  }

  return response.json();
}

export async function processExecutiveQuery(query: string): Promise<string> {
  const cookieStore = await cookies();
  // Extract cookie values needed by the backend logic
  const __session = await verifySession();
  const userId = __session?.id || '';
  const simulatedRole = cookieStore.get('simulatedRole')?.value;
  const executive_projectId = cookieStore.get('executive_projectId')?.value;

  // Call the AWS backend endpoint
  const response = await fetchWithAuth('/api/aiQueryActions/processExecutiveQuery', {
    method: 'POST',
    body: JSON.stringify({
      query, // Original function argument
      userId, // Pass userId from cookie to backend for verification
      simulatedRole, // Pass simulatedRole from cookie to backend for verification
      executive_projectId // Pass project ID from cookie to backend for query filtering
    }),
  });

  // Handle the response from the backend
  if (!response.success) {
    throw new Error(response.error || 'Failed to process query');
  }

  // No revalidatePath or revalidateTag in original, so none needed here.

  return response.result;
}
