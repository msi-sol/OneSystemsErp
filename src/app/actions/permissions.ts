'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { generateText } from 'ai';
// AI runs on OpenAI (OPENAI_API_KEY, gpt-6-luna by default); previously Gemini.
import { openAIModel } from '@/lib/ai/openai-model';
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
    throw new Error(backendErrorMessage(res.status, errorText));
  }
  return res.json();
}

export async function getRolesAndModules() {
  return await fetchWithAuth('/api/permissions/roles-modules');
}

export async function saveRolePermission(roleId: string, moduleId: string, field: string, value: boolean) {
  await fetchWithAuth('/api/permissions/role-permission', {
    method: 'POST',
    body: JSON.stringify({ roleId, moduleId, field, value })
  });

  revalidatePath('/admin/permissions');
  return { success: true };
}

export async function summarizeRolePermissions(roleName: string, permissions: any[]) {
  try {
    const activePerms = permissions.map(p => {
      const perms = [];
      if (p.canView) perms.push('View');
      if (p.canCreate) perms.push('Create');
      if (p.canEditDraft) perms.push('Edit Draft');
      if (p.canSubmit) perms.push('Submit');
      if (p.canReview) perms.push('Review');
      if (p.canRecommend) perms.push('Recommend');
      if (p.canApprove) perms.push('Approve');
      if (p.canReleasePayment) perms.push('Release Payment');
      if (p.canViewAuditLogs) perms.push('View Audit Logs');
      if (p.canLock) perms.push('Lock');
      
      return perms.length > 0 ? `${p.moduleName}: ${perms.join(', ')}` : null;
    }).filter(Boolean).join('\n');

    if (!activePerms) {
      return { success: true, summary: "This role currently has no active permissions." };
    }

    const systemPrompt = `
You are the ONESYSTEMS ERP Security AI.
The user will provide you with a list of module permissions granted to a specific role named "${roleName}".
Your task is to summarize these access rights in a clear, professional, and concise human-readable paragraph (2-4 sentences).
Explain what this role is authorized to do across the system, focusing on what they can prepare, review, approve, or pay.
Do not just list the modules. Synthesize the permissions into a summary of their responsibilities.
`;

    const { text } = await generateText({
      model: openAIModel(),
      system: systemPrompt,
      prompt: `Role: ${roleName}\n\nPermissions:\n${activePerms}`,
      // No temperature: the configured OpenAI model may be a reasoning model that rejects it.
    });

    return { success: true, summary: text };
  } catch (error: any) {
    console.error('AI Summary Error:', error);
    return { success: false, error: error.message || 'Failed to generate AI summary.' };
  }
}
