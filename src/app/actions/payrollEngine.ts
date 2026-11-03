'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

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
    throw new Error(`Backend Error: ${res.status} ${errorText}`);
  }
  return res.json();
}

/**
 * AI-Assisted Payroll Computation Engine
 */
export async function computePayrollForPeriod(payrollPeriodId: string) {
  const result = await fetchWithAuth('/api/payrollEngine/computePayrollForPeriod', {
    method: 'POST',
    body: JSON.stringify({ payrollPeriodId })
  });
  revalidatePath(`/payroll/${payrollPeriodId}`);
  return result;
}

export async function deletePayrollPeriod(periodId: string) {
  const result = await fetchWithAuth(`/api/payrollEngine/deletePayrollPeriod/${periodId}`, {
    method: 'DELETE'
  });
  revalidatePath('/payroll');
  return result;
}

export async function saveCutoffSetting(data: any) {
  try {
    await fetchWithAuth('/api/payrollEngine/saveCutoffSetting', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    revalidatePath('/payroll/settings');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteCutoffSetting(id: string) {
  try {
    await fetchWithAuth(`/api/payrollEngine/deleteCutoffSetting/${id}`, {
      method: 'DELETE'
    });
    revalidatePath('/payroll/settings');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
