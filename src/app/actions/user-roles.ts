'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Base URL for the AWS backend API. This should point to your AWS Express.js application.

/**
 * A wrapper around fetch that includes authentication headers and handles API responses.
 */
async function fetchWithAuth(url: string, options?: RequestInit) {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const session = __session?.id || '';
  
  if (!session) {
    // If not authenticated, redirect to login or throw an error
    redirect('/login'); 
  }

  const headers = {
    ...options?.headers,
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session}`,
    'x-user-session': session,
  };

  // Construct the full URL for the backend endpoint
  // The `url` parameter here will be like '/api/user-roles/functionName'

  const response = await backendFetch(`${url}`, {
    ...options,
    headers,
    // Prevent Next.js from aggressively caching fetch requests in Server Actions
    cache: 'no-store', 
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      // If JSON parsing fails, return a generic error message
      errorData = { message: `Server error: ${response.statusText || 'Unknown'}` };
    }
    throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
  }

  return response.json();
}

const API_ROUTE_PREFIX = '/api/user-roles'; // This will be appended to BACKEND_API_BASE_URL

export async function getUsersWithRoles() {
  const response = await fetchWithAuth(`${API_ROUTE_PREFIX}/getUsersWithRoles`, {
    method: 'POST',
  });
  
  // Assuming the backend returns { success: true, users: [...], roles: [...] } on success
  if (response.success) {
    return { users: response.users, roles: response.roles };
  }
  throw new Error(response.error || 'Failed to fetch users and roles.');
}

export async function assignRoleToUser(userId: string, roleId: string) {
  const response = await fetchWithAuth(`${API_ROUTE_PREFIX}/assignRoleToUser`, {
    method: 'POST',
    body: JSON.stringify({ userId, roleId }),
  });
  
  if (response.success) {
    revalidatePath('/admin/user-roles');
  }
  return response; // Returns { success: true } or { success: false, error: ... }
}

export async function removeRoleFromUser(userId: string, roleId: string) {
  const response = await fetchWithAuth(`${API_ROUTE_PREFIX}/removeRoleFromUser`, {
    method: 'POST',
    body: JSON.stringify({ userId, roleId }),
  });
  
  if (response.success) {
    revalidatePath('/admin/user-roles');
  }
  return response; // Returns { success: true } or { success: false, error: ... }
}

export async function updateUserStatus(userId: string, status: string) {
  const response = await fetchWithAuth(`${API_ROUTE_PREFIX}/updateUserStatus`, {
    method: 'POST',
    body: JSON.stringify({ userId, status }),
  });
  
  if (response.success) {
    revalidatePath('/admin/user-roles');
  }
  return response; // Returns { success: true } or { success: false, error: ... }
}
