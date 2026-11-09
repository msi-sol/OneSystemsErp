'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { backendErrorMessage } from '@/lib/backend-error';

// --- Standard fetchWithAuth definition (as per instructions) ---
async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const cookieStore = await cookies(); // No await needed if directly using cookies()
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
    throw new Error(backendErrorMessage(res.status, errorText));
  }
  return res.json();
}

// --- PROXIED SERVER ACTIONS ---
const API_ROUTE_PREFIX = '/api/subcontractingActions'; // Defined by user request

export async function getSubcontractors() {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/getSubcontractors`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return result.data; // Assuming backend wraps result in { success: true, data: ... }
  } catch (error: any) {
    console.error('Error in getSubcontractors:', error);
    throw new Error('Failed to fetch subcontractors: ' + error.message);
  }
}

export async function getSubcontractorById(id: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/getSubcontractorById`, {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    return result.data;
  } catch (error: any) {
    console.error('Error in getSubcontractorById:', error);
    throw new Error('Failed to fetch subcontractor by ID: ' + error.message);
  }
}

export async function getSubcontractPackages(projectId?: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/getSubcontractPackages`, {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
    return result.data;
  } catch (error: any) {
    console.error('Error in getSubcontractPackages:', error);
    throw new Error('Failed to fetch subcontract packages: ' + error.message);
  }
}

export async function getAccomplishments(packageId?: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/getAccomplishments`, {
      method: 'POST',
      body: JSON.stringify({ packageId }),
    });
    return result.data;
  } catch (error: any) {
    console.error('Error in getAccomplishments:', error);
    throw new Error('Failed to fetch accomplishments: ' + error.message);
  }
}

export async function getBillings(packageId?: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/getBillings`, {
      method: 'POST',
      body: JSON.stringify({ packageId }),
    });
    return result.data;
  } catch (error: any) {
    console.error('Error in getBillings:', error);
    throw new Error('Failed to fetch billings: ' + error.message);
  }
}

export async function getAwardedBoqItemsByProjectId(projectId: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/getAwardedBoqItemsByProjectId`, {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
    // Original function returns { success: true, items } directly
    return result; 
  } catch (error: any) {
    console.error('Error in getAwardedBoqItemsByProjectId:', error);
    return { success: false, error: error.message };
  }
}

export async function getSubcontractPackageById(id: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/getSubcontractPackageById`, {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    return result.data;
  } catch (error: any) {
    console.error('Error in getSubcontractPackageById:', error);
    throw new Error('Failed to fetch subcontract package by ID: ' + error.message);
  }
}

export async function createSubcontractor(data: any) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/createSubcontractor`, {
      method: 'POST',
      body: JSON.stringify({ data })
    });
    revalidatePath('/subcontracting/subcontractors');
    return result;
  } catch (error: any) {
    console.error('Error in createSubcontractor:', error);
    return { success: false, error: error.message };
  }
}

export async function updateSubcontractor(id: string, data: any) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/updateSubcontractor`, {
      method: 'POST',
      body: JSON.stringify({ id, data })
    });
    revalidatePath('/subcontracting/subcontractors');
    revalidatePath(`/subcontracting/subcontractors/${id}`);
    return result;
  } catch (error: any) {
    console.error('Error in updateSubcontractor:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteSubcontractor(id: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/deleteSubcontractor`, {
      method: 'POST',
      body: JSON.stringify({ id }) // DELETE requests can have body, but POST for uniform mapping
    });
    revalidatePath('/subcontracting/subcontractors');
    return result;
  } catch (error: any) {
    console.error('Error in deleteSubcontractor:', error);
    return { success: false, error: error.message };
  }
}

export async function createSubcontractPackage(data: any) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/createSubcontractPackage`, {
      method: 'POST',
      body: JSON.stringify({ data })
    });
    revalidatePath('/subcontracting/packages');
    return result;
  } catch (error: any) {
    console.error('Error in createSubcontractPackage:', error);
    return { success: false, error: error.message };
  }
}

export async function updateSubcontractPackage(id: string, data: any) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/updateSubcontractPackage`, {
      method: 'POST',
      body: JSON.stringify({ id, data })
    });
    revalidatePath('/subcontracting/packages');
    revalidatePath(`/subcontracting/packages/${id}`);
    return result;
  } catch (error: any) {
    console.error('Error in updateSubcontractPackage:', error);
    return { success: false, error: error.message };
  }
}

export async function createAccomplishment(data: any) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/createAccomplishment`, {
      method: 'POST',
      body: JSON.stringify({ data })
    });
    revalidatePath('/subcontracting/accomplishments');
    return result;
  } catch (error: any) {
    console.error('Error in createAccomplishment:', error);
    return { success: false, error: error.message };
  }
}

export async function createBilling(data: any) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/createBilling`, {
      method: 'POST',
      body: JSON.stringify({ data })
    });
    revalidatePath('/subcontracting/billings');
    return result;
  } catch (error: any) {
    console.error('Error in createBilling:', error);
    return { success: false, error: error.message };
  }
}

export async function createFullSubcontractPackage(packageData: any, boqItems: any[], powData: any) {
  try {
    const result = await fetchWithAuth(`/api/subcontracting/packages/full`, {
      method: 'POST',
      body: JSON.stringify({ packageData, boqItems, powData })
    });
    revalidatePath('/subcontracting/dashboard');
    return result;
  } catch (error: any) {
    console.error('Error in createFullSubcontractPackage:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteSubcontractPackage(id: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/deleteSubcontractPackage`, {
      method: 'POST',
      body: JSON.stringify({ id }) // DELETE requests can have body, but POST for uniform mapping
    });
    revalidatePath('/subcontracting/dashboard');
    return result;
  } catch (error: any) {
    console.error('Error in deleteSubcontractPackage:', error);
    return { success: false, error: error.message };
  }
}

export async function updateFullSubcontractPackage(id: string, packageData: any, boqItems: any[], powData: any) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/updateFullSubcontractPackage`, {
      method: 'POST',
      body: JSON.stringify({ id, packageData, boqItems, powData })
    });
    revalidatePath('/subcontracting/dashboard');
    return result;
  } catch (error: any) {
    console.error('Error in updateFullSubcontractPackage:', error);
    return { success: false, error: error.message };
  }
}

export async function updateSubcontractPackageStatus(id: string, status: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/updateSubcontractPackageStatus`, {
      method: 'POST',
      body: JSON.stringify({ id, status })
    });
    revalidatePath(`/subcontracting/packages/${id}`);
    revalidatePath('/subcontracting/packages');
    revalidatePath('/subcontracting/dashboard');
    revalidatePath('/subcontracting/progress-hub');
    revalidatePath(`/subcontracting/progress-hub/${id}`);
    return result;
  } catch (error: any) {
    console.error('Error in updateSubcontractPackageStatus:', error);
    return { success: false, error: error.message };
  }
}

export async function unlockSubcontractPackage(id: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/unlockSubcontractPackage`, {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    revalidatePath(`/subcontracting/packages/${id}`);
    revalidatePath('/subcontracting/packages');
    revalidatePath(`/subcontracting/packages/${id}/edit`);
    return result;
  } catch (error: any) {
    console.error('Error in unlockSubcontractPackage:', error);
    return { success: false, error: error.message };
  }
}
