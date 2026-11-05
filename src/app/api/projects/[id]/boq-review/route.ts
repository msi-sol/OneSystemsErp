import { NextResponse } from 'next/server';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { BOQModuleReviewError, reviewBOQModule } from '@/lib/boq/module-review';
import { adoptCorrectedBOQSource, BOQSourceVersionError, decideCorrectedBOQIdentity } from '@/lib/boq/source-version-workflow';
import { prepareLegacyBOQReview, BOQReviewPreparationError } from '@/lib/boq/prepare-legacy-review';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getSessionActor();
    const { id } = await params;
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid review request.' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid review request.' }, { status: 400 });
    const payload = body as Record<string, unknown>;
    if (payload.action === 'prepare-review') {
      const versionId = typeof payload.versionId === 'string' ? payload.versionId : '';
      return NextResponse.json(await prepareLegacyBOQReview({ actor, projectId: id, versionId }));
    }
    if (payload.action === 'identity-decision' || payload.action === 'adopt-source') {
      const versionId = typeof payload.versionId === 'string' ? payload.versionId : '';
      const expectedRowVersion = Number(payload.expectedRowVersion);
      const sourceVersionId = typeof payload.sourceVersionId === 'string' ? payload.sourceVersionId : '';
      if (payload.action === 'identity-decision') {
        if (!['SAME_ITEM', 'NEW_ITEM', 'SET_ASIDE'].includes(String(payload.decision))) return NextResponse.json({ error: 'Invalid source identity decision.' }, { status: 400 });
        return NextResponse.json(await decideCorrectedBOQIdentity({ actor, projectId: id, versionId, expectedRowVersion, sourceVersionId, identityKey: String(payload.identityKey || ''), decision: payload.decision as 'SAME_ITEM' | 'NEW_ITEM' | 'SET_ASIDE', reason: String(payload.reason || '') }));
      }
      return NextResponse.json(await adoptCorrectedBOQSource({ actor, projectId: id, versionId, expectedRowVersion, sourceVersionId }));
    }
    return NextResponse.json(await reviewBOQModule(id, actor, payload));
  } catch (error) {
    if (error instanceof BOQModuleReviewError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof BOQSourceVersionError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof BOQReviewPreparationError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    return NextResponse.json({ error: 'The BOQ review could not be saved.' }, { status: 500 });
  }
}
