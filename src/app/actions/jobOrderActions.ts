'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

const API_ROUTE_PREFIX = '/api/jobOrderActions'; // New common prefix for all actions
const JOB_ORDER_WRITE_ROUTE = '/api/subcontracting/job-orders'; // Owns create and edit: permissions, locks and BOQ conflict rules

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const cookieStore = await cookies(); // `cookies()` is not awaitable
  const __session = await verifySession();
  const session = __session?.id || '';
  const activeProjectId = cookieStore.get('activeProjectId')?.value;
  const simulatedRole = cookieStore.get('simulatedRole')?.value;

  const headers = new Headers(options.headers);
  if (session) headers.set('x-user-session', session);
  if (activeProjectId) headers.set('x-active-project-id', activeProjectId);
  if (simulatedRole) headers.set('x-simulated-role', simulatedRole);
  headers.set('Content-Type', 'application/json');

  const res = await backendFetch(`${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorText = await res.text();
    let backendMessage: unknown;
    try { backendMessage = JSON.parse(errorText)?.error; } catch { /* Not a JSON error body. */ }
    throw new Error(typeof backendMessage === 'string' ? backendMessage : `Backend Error: ${res.status} ${errorText}`);
  }
  return res.json();
}

// --- JOB ORDER READ (Now Proxied to AWS Backend) ---

export async function getJobOrders(projectId?: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/getJobOrders`, {
      method: 'POST',
      body: JSON.stringify({ projectId })
    });
    return result.data; // Original returned array directly, backend returns { success: true, data: [...] }
  } catch (error: any) {
    console.error("Get Job Orders Error:", error);
    // Original returned raw array or Prisma error, now returning consistent error structure
    return { success: false, error: error.message };
  }
}

export async function getJobOrderById(id: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/getJobOrderById`, {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    return result; // Original returned { success: true, data: {...} }, matches backend
  } catch (error: any) {
    console.error("Get Job Order By Id Error:", error);
    return { success: false, error: error.message };
  }
}

export async function getConsolidatedBoqItemsByProjectId(projectId: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/getConsolidatedBoqItemsByProjectId`, {
      method: 'POST',
      body: JSON.stringify({ projectId })
    });
    return result; // Original returned { success: true, items: [...] }, matches backend
  } catch (error: any) {
    console.error("Get Consolidated BOQ Items Error:", error);
    return { success: false, error: error.message };
  }
}

// --- JOB ORDER MUTATIONS (Proxied to AWS Backend via new RPC-style endpoints) ---

export async function createJobOrder(data: any) {
  try {
    const result = await fetchWithAuth(JOB_ORDER_WRITE_ROUTE, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    revalidatePath('/subcontracting/job-orders');
    revalidatePath('/job-orders/dashboard');
    return result; // Original returned result of fetchWithAuth, matches backend
  } catch (error: any) {
    console.error("Create Job Order Error:", error);
    return { success: false, error: error.message };
  }
}

export async function updateJobOrder(id: string, data: any) {
  try {
    const result = await fetchWithAuth(`${JOB_ORDER_WRITE_ROUTE}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    
    revalidatePath('/job-orders/dashboard');
    revalidatePath(`/job-orders/${id}`);
    return result; // Original returned result of fetchWithAuth, matches backend
  } catch (error: any) {
    console.error("Update Job Order Error:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteJobOrder(id: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/deleteJobOrder`, {
      method: 'POST',
      body: JSON.stringify({ id }) // Pass id in the body for the RPC call
    });
    
    revalidatePath('/job-orders/dashboard');
    return result; // Original returned result of fetchWithAuth, matches backend
  } catch (error: any) {
    console.error("Delete Job Order Error:", error);
    return { success: false, error: error.message };
  }
}

export async function updateJobOrderStatus(id: string, newStatus: any) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/updateJobOrderStatus`, {
      method: 'POST',
      body: JSON.stringify({ id, newStatus }) // Pass both id and newStatus in the body
    });
    
    revalidatePath(`/job-orders/${id}`);
    return result; // Original returned result of fetchWithAuth, matches backend
  } catch (error: any) {
    console.error("Update Job Order Status Error:", error);
    return { success: false, error: error.message };
  }
}

export async function unlockJobOrder(id: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/unlockJobOrder`, {
      method: 'POST',
      body: JSON.stringify({ id }) // Pass id in the body for the RPC call
    });
    
    revalidatePath(`/job-orders/${id}`);
    return result; // Original returned result of fetchWithAuth, matches backend
  } catch (error: any) {
    console.error("Unlock Job Order Error:", error);
    return { success: false, error: error.message };
  }
}
