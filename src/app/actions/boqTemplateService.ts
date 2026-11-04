'use server';

import { backendFetch } from '@/lib/backend-fetch';

export async function generateBOQTemplate(projectId?: string) {
  try {
    // backendFetch verifies the current Auth.js session and signs the request.
    // The backend derives the audit actor from that verified identity.
    const response = await backendFetch('/api/boqTemplateService/generateBOQTemplate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    if (response.status === 401) return { success: false, error: 'Your session has expired. Please sign in again.' };
    if (response.status === 403) return { success: false, error: 'You are not authorized to download this template.' };
    if (!response.ok) throw new Error(`Template generation failed with status ${response.status}`);
    return response.json();
  } catch (error) {
    console.error("Error in Next.js proxy for generateBOQTemplate:", error);
    return {
      success: false,
      error: 'Unable to download the BOQ template. Please try again.'
    };
  }
}
