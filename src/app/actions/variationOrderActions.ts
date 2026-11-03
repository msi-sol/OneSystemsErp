'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import {
  VariationOrder,
  VariationOrderItem,
  VariationOrderDocument,
  VariationOrderApproval,
  AwardedBOQItem,
  MaterialRequest,
  SubcontractPackage
} from '@prisma/client';

async function fetchWithAuth(url: string, options?: RequestInit) {
  const headers = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  const response = await backendFetch(`${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || response.statusText);
  }
  return response.json();
}

export async function getAllVariationOrders(): Promise<VariationOrder[]> {
  try {
    const result = await fetchWithAuth('/api/variationOrderActions/getAllVariationOrders', {
      method: 'POST',
      body: JSON.stringify({})
    });
    return result.data;
  } catch (error: any) {
    throw new Error('Failed to fetch Variation Orders: ' + error.message);
  }
}

export async function getAllClientVariationOrders(): Promise<VariationOrder[]> {
  try {
    const cookieStore = await cookies();
    const activeProjectId = cookieStore.get('activeProjectId')?.value;

    const result = await fetchWithAuth('/api/variationOrderActions/getAllClientVariationOrders', {
      method: 'POST',
      body: JSON.stringify({ activeProjectId })
    });
    return result.data;
  } catch (error: any) {
    throw new Error('Failed to fetch Client Variation Orders: ' + error.message);
  }
}

export async function getAllSubcontractorVariationOrders(projectId?: string): Promise<VariationOrder[]> {
  try {
    const cookieStore = await cookies();
    const activeProjectId = cookieStore.get('activeProjectId')?.value;

    const result = await fetchWithAuth('/api/variationOrderActions/getAllSubcontractorVariationOrders', {
      method: 'POST',
      body: JSON.stringify({ projectId, activeProjectId })
    });
    return result.data;
  } catch (error: any) {
    throw new Error('Failed to fetch Subcontractor Variation Orders: ' + error.message);
  }
}

export async function getVariationOrders(projectId: string): Promise<VariationOrder[]> {
  try {
    const result = await fetchWithAuth('/api/variationOrderActions/getVariationOrders', {
      method: 'POST',
      body: JSON.stringify({ projectId })
    });
    return result.data;
  } catch (error: any) {
    throw new Error('Failed to fetch Variation Orders: ' + error.message);
  }
}

export async function getVariationOrderById(id: string): Promise<VariationOrder | null> {
  try {
    const result = await fetchWithAuth('/api/variationOrderActions/getVariationOrderById', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    return result.data;
  } catch (error: any) {
    throw new Error('Failed to fetch Variation Order details: ' + error.message);
  }
}

export async function getProjectAwardedBOQItems(projectId: string): Promise<AwardedBOQItem[]> {
  try {
    const result = await fetchWithAuth('/api/variationOrderActions/getProjectAwardedBOQItems', {
      method: 'POST',
      body: JSON.stringify({ projectId })
    });
    return result.data;
  } catch (error: any) {
    throw new Error('Failed to fetch BOQ items: ' + error.message);
  }
}

export async function createVariationOrder(data: any): Promise<VariationOrder> {
  try {
    const result = await fetchWithAuth('/api/variationOrderActions/createVariationOrder', {
      method: 'POST',
      body: JSON.stringify({ data })
    });
    revalidatePath(`/projects/${data.projectId}`);
    revalidatePath(`/variation-orders`);
    return result.data;
  } catch (error: any) {
    throw new Error('Failed to create Variation Order: ' + error.message);
  }
}

export async function addVariationOrderItem(voId: string, data: any): Promise<VariationOrderItem> {
  try {
    const result = await fetchWithAuth('/api/variationOrderActions/addVariationOrderItem', {
      method: 'POST',
      body: JSON.stringify({ voId, data })
    });
    return result.data;
  } catch (error: any) {
    throw new Error('Failed to add BOQ item: ' + error.message);
  }
}

export async function deleteVariationOrderItem(itemId: string, voId: string): Promise<boolean> {
  try {
    await fetchWithAuth('/api/variationOrderActions/deleteVariationOrderItem', {
      method: 'POST',
      body: JSON.stringify({ itemId, voId })
    });
    return true;
  } catch (error: any) {
    throw new Error('Failed to delete BOQ item: ' + error.message);
  }
}

export async function recalculateVariationOrderTotals(voId: string): Promise<void> {
  try {
    await fetchWithAuth('/api/variationOrderActions/recalculateVariationOrderTotals', {
      method: 'POST',
      body: JSON.stringify({ voId })
    });
    revalidatePath(`/variation-orders/${voId}`);
  } catch (error: any) {
    throw new Error('Failed to recalculate VO totals: ' + error.message);
  }
}

export async function submitVariationOrder(id: string): Promise<VariationOrder> {
  try {
    const result = await fetchWithAuth('/api/variationOrderActions/submitVariationOrder', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    revalidatePath(`/variation-orders/${id}`);
    return result.data;
  } catch (error: any) {
    throw new Error('Failed to submit: ' + error.message);
  }
}

export async function approveVariationOrderStage(voId: string, stage: string, action: string, userId: string, remarks: string): Promise<VariationOrder> {
  try {
    const result = await fetchWithAuth('/api/variationOrderActions/approveVariationOrderStage', {
      method: 'POST',
      body: JSON.stringify({ voId, stage, action, userId, remarks })
    });
    revalidatePath(`/variation-orders/${voId}`);
    return result.data;
  } catch (error: any) {
    throw new Error('Failed to process approval: ' + error.message);
  }
}

export async function createMRFFromVO(voId: string, itemIds: string[], userId: string): Promise<MaterialRequest> {
  try {
    const result = await fetchWithAuth('/api/variationOrderActions/createMRFFromVO', {
      method: 'POST',
      body: JSON.stringify({ voId, itemIds, userId })
    });
    return result.data;
  } catch (error: any) {
    throw new Error('Failed to create MRF from VO: ' + error.message);
  }
}

export async function createSubcontractFromVO(voId: string, itemIds: string[]): Promise<SubcontractPackage> {
  try {
    const result = await fetchWithAuth('/api/variationOrderActions/createSubcontractFromVO', {
      method: 'POST',
      body: JSON.stringify({ voId, itemIds })
    });
    return result.data;
  } catch (error: any) {
    throw new Error('Failed to create Subcontract from VO: ' + error.message);
  }
}

export async function deleteVariationOrder(id: string): Promise<boolean> {
  try {
    const voBeforeDelete = await getVariationOrderById(id);

    await fetchWithAuth('/api/variationOrderActions/deleteVariationOrder', {
      method: 'POST',
      body: JSON.stringify({ id })
    });

    if (voBeforeDelete?.projectId) {
      revalidatePath(`/projects/${voBeforeDelete.projectId}`);
    }
    revalidatePath(`/variation-orders`);
    return true;
  } catch (error: any) {
    throw new Error('Failed to force delete Variation Order: ' + error.message);
  }
}

export async function updateVariationOrderDetails(id: string, data: any): Promise<VariationOrder> {
  try {
    const result = await fetchWithAuth('/api/variationOrderActions/updateVariationOrderDetails', {
      method: 'POST',
      body: JSON.stringify({ id, data })
    });
    return result.data;
  } catch (error: any) {
    throw new Error('Failed to update Variation Order: ' + error.message);
  }
}
