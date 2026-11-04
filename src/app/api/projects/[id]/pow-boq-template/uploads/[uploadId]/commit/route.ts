import { NextRequest, NextResponse } from 'next/server';
import { approveTemplateUploadForCurrentActor } from '@/lib/boq/approve-template-upload';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string, uploadId: string }>}) {
  try {
    const { id, uploadId } = await params;
    const result = await approveTemplateUploadForCurrentActor(uploadId, id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'BOQ import failed.';
    const status = message.startsWith('UNAUTHORIZED') ? 401 : message.includes('permission to approve') ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
