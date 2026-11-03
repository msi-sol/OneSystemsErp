'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath } from "next/cache";

// --- Standard fetchWithAuth wrapper definition ---
// This is a placeholder. In a real app, it would handle token injection, base URL, etc.
// For demonstration, it just acts as a basic fetch wrapper.
async function fetchWithAuth(input: string | URL, init?: RequestInit): Promise<Response> {
    // In a real app, you'd add authentication headers here, e.g., Bearer token
  const headers = {
    'Content-Type': 'application/json',
    // 'Authorization': `Bearer ${await getAuthToken()}`, // Example for auth
    ...(init?.headers || {})
  };

  const response = await backendFetch(`${input}`, { ...init, headers });
  return response;
}
// --------------------------------------------------

export async function saveTemplateAction(
  projectId: string,
  templateType: string,
  fileName: string,
  parsedData: any
) {
  try {
    const response = await fetchWithAuth('/api/templateActions/saveTemplateAction', {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        templateType,
        fileName,
        parsedData,
      }),
    });
    const data = await response.json();

    if (response.ok && data.success) {
      revalidatePath("/accomplishments");
      return data;
    } else {
      console.error("Save Template Action Error:", data.error || 'Unknown error');
      return { success: false, error: data.error || 'Unknown error' };
    }
  } catch (error: any) {
    console.error("Save Template Action Network Error:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteTemplateAction(templateId: string) {
  try {
    const response = await fetchWithAuth('/api/templateActions/deleteTemplateAction', {
      method: 'POST',
      body: JSON.stringify({ templateId }),
    });
    const data = await response.json();

    if (response.ok && data.success) {
      revalidatePath("/accomplishments");
      return data;
    } else {
      console.error("Delete Template Action Error:", data.error || 'Unknown error');
      return { success: false, error: data.error || 'Unknown error' };
    }
  } catch (error: any) {
    console.error("Delete Template Action Network Error:", error);
    return { success: false, error: error.message };
  }
}

export async function toggleLockTemplateAction(templateId: string, currentLockState: boolean) {
  try {
    const response = await fetchWithAuth('/api/templateActions/toggleLockTemplateAction', {
      method: 'POST',
      body: JSON.stringify({ templateId, currentLockState }),
    });
    const data = await response.json();

    if (response.ok && data.success) {
      revalidatePath("/accomplishments");
      return data;
    } else {
      console.error("Toggle Lock Template Action Error:", data.error || 'Unknown error');
      return { success: false, error: data.error || 'Unknown error' };
    }
  } catch (error: any) {
    console.error("Toggle Lock Template Action Network Error:", error);
    return { success: false, error: error.message };
  }
}

export async function updateTemplateDataAction(templateId: string, parsedData: any) {
  try {
    const response = await fetchWithAuth('/api/templateActions/updateTemplateDataAction', {
      method: 'POST',
      body: JSON.stringify({ templateId, parsedData }),
    });
    const data = await response.json();

    if (response.ok && data.success) {
      revalidatePath("/accomplishments");
      return data;
    } else {
      console.error("Update Template Data Action Error:", data.error || 'Unknown error');
      return { success: false, error: data.error || 'Unknown error' };
    }
  } catch (error: any) {
    console.error("Update Template Data Action Network Error:", error);
    return { success: false, error: error.message };
  }
}

export async function syncTemplateWithBOQAction(projectId: string, parsedData: any[]) {
  try {
    const response = await fetchWithAuth('/api/templateActions/syncTemplateWithBOQAction', {
      method: 'POST',
      body: JSON.stringify({ projectId, parsedData }),
    });
    const data = await response.json();

    if (response.ok && data.success) {
      // No revalidatePath in original action for this function, so none here.
      return data;
    } else {
      console.error("Sync Template with BOQ Action Error:", data.error || 'Unknown error');
      return { success: false, error: data.error || 'Unknown error' };
    }
  } catch (error: any) {
    console.error("Sync Template with BOQ Action Network Error:", error);
    return { success: false, error: error.message };
  }
}
