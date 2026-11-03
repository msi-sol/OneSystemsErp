'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

/**
 * Helper to fetch data from the authenticated backend.
 * In a real application, this would handle attaching authentication tokens
 * (e.g., JWT from session cookies) to requests and managing the backend base URL.
 */
async function fetchWithAuth(url: string, options?: RequestInit) {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const authToken = __session?.id || '';

  const headers = new Headers(options?.headers);
  headers.set('Content-Type', 'application/json');
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  // IMPORTANT: Configure this environment variable to point to your AWS Express backend URL.
  // Example: 'https://your-aws-lambda-api-gateway-url.amazonaws.com'

  const response = await backendFetch(`${url}`, {
    ...options,
    headers,
  });

  const result = await response.json();

  if (!response.ok || result.success === false) {
    const errorMessage = result.error || response.statusText || 'Unknown backend error';
    throw new Error(`API call failed: ${errorMessage}`);
  }
  
  return result.data; // Assuming backend returns { success: true, data: ... }
}

// Helper function to get userId from Next.js cookies, used internally by the actions.
async function getUserId() {
  const cookieStore = await cookies();
  const __session = await verifySession();
  return __session?.id || '';
}

// Define the API route prefix for this service
const API_ROUTE_PREFIX = '/api/hikvisionDeviceService';

export async function getHikvisionDevices() {
  // Obtain userId from Next.js context and pass to backend for permission check
  const userId = await getUserId(); 
  const response = await fetchWithAuth(`${API_ROUTE_PREFIX}/getHikvisionDevices`, {
    method: 'POST',
    body: JSON.stringify({ userId }), // Pass userId in body
  });
  return response;
}

export async function registerHikvisionDevice(data: any) {
  // Obtain userId from Next.js context and pass to backend for permission check
  const userId = await getUserId(); 
  const response = await fetchWithAuth(`${API_ROUTE_PREFIX}/registerHikvisionDevice`, {
    method: 'POST',
    body: JSON.stringify({ userId, data }), // Pass userId and the original data object
  });
  // The original file did not include revalidatePath/Tag, so it's omitted here.
  return response;
}

export async function testDeviceConnection(deviceId: string) {
  // Obtain userId from Next.js context and pass to backend for permission check
  const userId = await getUserId(); 
  const response = await fetchWithAuth(`${API_ROUTE_PREFIX}/testDeviceConnection`, {
    method: 'POST',
    body: JSON.stringify({ userId, deviceId }), // Pass userId and the original deviceId
  });
  return response;
}
