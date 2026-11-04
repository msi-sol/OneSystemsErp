'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// fetchWithAuth definition
type FetchWithAuthOptions = RequestInit & {
  // In a real application, you might add accessToken/refreshToken here
  // or `fetchWithAuth` might automatically get them from cookies.
};

async function fetchWithAuth(url: string, options: FetchWithAuthOptions = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await backendFetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    // The backend error response format is { success: false, error: '...' }
    // So we try to extract 'error' directly.
    throw new Error(errorData.error || 'Something went wrong on the server.');
  }

  return response.json();
}

export async function updateProfile(formData: FormData) {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const userId = __session?.id || '';

  if (!userId) {
    return { success: false, error: 'Unauthorized. Please log in.' };
  }

  // Extract formData into a plain object to send as JSON
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;

  // Client-side validation for immediate feedback
  if (!name || !email) {
    return { success: false, error: 'Name and email are required.' };
  }

  try {
    const body = {
      name,
      email,
    };

    const result = await fetchWithAuth('/api/profile/updateProfile', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (result.success) {
      revalidatePath('/');
      revalidatePath('/profile');
    }

    return result; // The backend should return { success: true, message: '...' } or { success: false, error: '...' }
  } catch (error: any) {
    console.error('Error in proxy updateProfile:', error);
    // If fetchWithAuth throws an error, it will be caught here.
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}
