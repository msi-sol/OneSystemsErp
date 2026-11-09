'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { backendErrorMessage } from '@/lib/backend-error';

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const cookieStore = await cookies();
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
    if (res.status === 400 && errorText.includes('AI Blocked')) {
      return JSON.parse(errorText); // Pass the validation block to frontend (body already read above)
    }
    throw new Error(backendErrorMessage(res.status, errorText));
  }
  return res.json();
}

export async function createPayrollPeriod(data: any, userId: string) {
  try {
    const result = await fetchWithAuth('/api/payroll/period/create', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    if (result.success) {
      revalidatePath('/payroll');
    }
    
    return result;
  } catch (error: any) {
    console.error('Error creating payroll period:', error);
    return { success: false, error: error.message || 'Failed to create payroll period' };
  }
}
