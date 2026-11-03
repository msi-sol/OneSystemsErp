'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { cookies } from 'next/headers';

// --- Standard fetchWithAuth definition ---
// In a real application, this would typically be a more robust utility
// that handles token retrieval (e.g., from cookies/session), error parsing,
// and potentially token refreshing.
async function fetchWithAuth(url: string, options?: RequestInit) {
  const response = await backendFetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { error: response.statusText || 'Unknown error occurred.' };
    }
    throw new Error(errorData.error || errorData.message || response.statusText);
  }
  return response.json();
}
// ---

async function getUserId() {
  const cookieStore = await cookies(); // No await needed if using Next.js 13+ headers()
  const __session = await verifySession();
  return __session?.id || '';
}

export async function getLiveFleetLocations() {
  const userId = await getUserId();

  try {
    const response = await fetchWithAuth('/api/fleetTelemetryService/getLiveFleetLocations', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch live fleet locations.');
    }

    return response.data;
  } catch (error) {
    console.error('Error fetching live fleet locations:', error);
    throw error; // Re-throw to be handled by calling UI component
  }
}
