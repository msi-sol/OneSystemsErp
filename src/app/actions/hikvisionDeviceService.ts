'use server';
import { backendFetch } from '@/lib/backend-fetch';

// backendFetch signs the current session into the request; the backend reads the user from that.
async function fetchWithAuth(url: string, options?: RequestInit) {
  const headers = new Headers(options?.headers);
  headers.set('Content-Type', 'application/json');

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

// Define the API route prefix for this service
const API_ROUTE_PREFIX = '/api/hikvisionDeviceService';

export async function getHikvisionDevices() {
  const response = await fetchWithAuth(`${API_ROUTE_PREFIX}/getHikvisionDevices`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return response;
}

export async function registerHikvisionDevice(data: any) {
  const response = await fetchWithAuth(`${API_ROUTE_PREFIX}/registerHikvisionDevice`, {
    method: 'POST',
    body: JSON.stringify({ data }),
  });
  // The original file did not include revalidatePath/Tag, so it's omitted here.
  return response;
}

export async function testDeviceConnection(deviceId: string) {
  const response = await fetchWithAuth(`${API_ROUTE_PREFIX}/testDeviceConnection`, {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  });
  return response;
}
