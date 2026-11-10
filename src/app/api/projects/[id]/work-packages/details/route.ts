import { WorkPackageExecutionError } from '@/lib/scheduling/work-package-execution';
import { NextResponse } from 'next/server';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { updateWorkPackageDetails, WorkPackageDetailsError } from '@/lib/scheduling/work-package-details';
import { removeWorkspaceOriginal } from '@/lib/boq/workspace-service';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { id: projectId } = await params;
    const actor = await getSessionActor();
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'INVALID_JSON_BODY' }, { status: 400 }); }
    const result = await updateWorkPackageDetails({ projectId, actor, body });
    // Removed DUPAs: delete their stored originals only after the plan change is saved (best effort).
    if (result && typeof result === 'object' && 'storagePaths' in result) {
      const { storagePaths, ...rest } = result as { storagePaths?: string[] } & Record<string, unknown>;
      for (const path of storagePaths ?? []) await removeWorkspaceOriginal(path).catch(() => undefined);
      return NextResponse.json(rest);
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WorkPackageExecutionError) return NextResponse.json({error:error.message},{status:error.status});
    if (error instanceof WorkPackageDetailsError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    console.error('Work Package details request failed:', error);
    return NextResponse.json({ error: 'WORK_PACKAGE_DETAILS_REQUEST_FAILED' }, { status: 500 });
  }
}
