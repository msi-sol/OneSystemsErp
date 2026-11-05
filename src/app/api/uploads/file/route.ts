import { NextResponse } from 'next/server';
import { verifyApiSession } from '@/lib/dal/auth';
import { hasPermission, getPermissionsForRole, getUserPermissions } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { headStoredUpload, readStoredUpload, validateUploadKey, validLocalIntegrationDownload } from '@/lib/s3';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const key = validateUploadKey(url.searchParams.get('key') || '');
    const integrationAccess = validLocalIntegrationDownload(url, key);
    const actor = integrationAccess ? null : await verifyApiSession();
    if (!actor && !integrationAccess) return new NextResponse('Unauthorized', { status: 401 });
    if (actor?.mustChangePassword) return new NextResponse('Password change required', { status: 403 });
    const object = await headStoredUpload(key);
    const metadata = object.Metadata || {};
    if (!metadata.module || !metadata.uploadedby) return new NextResponse('Not found', { status: 404 });
    const permissions = actor && metadata.adminonly === 'true' ? await getUserPermissions(actor.id) : null;
    let allowed = integrationAccess || Boolean(actor && (metadata.adminonly === 'true'
      ? metadata.uploadedby === actor.id || Boolean(permissions?.IS_ADMIN || permissions?.IS_SYSTEM_ADMIN)
      : metadata.uploadedby === actor.id || await hasPermission(actor.id, metadata.module, 'canView')));
    if (!allowed && actor && metadata.projectid && metadata.adminonly !== 'true') {
      const assignment = await prisma.projectUserAssignment.findUnique({ where: { userId_projectId: { userId: actor.id, projectId: metadata.projectid } } });
      if (assignment?.assignmentStatus.toLowerCase() === 'active') {
        const permissions = await getPermissionsForRole(assignment.projectRole);
        allowed = Boolean(permissions[metadata.module]?.canView);
      }
    }
    if (!allowed) return new NextResponse('Forbidden', { status: 403 });
    const buffer = await readStoredUpload(`s3:${key}`);
    const originalName = metadata.filenameencoding === 'base64' ? Buffer.from(metadata.filename || '', 'base64').toString('utf8') : decodeURIComponent(metadata.filename || key.split('/').pop() || 'file');
    const fileName = originalName.replace(/[\r\n"\\]/g, '_');
    const contentType = object.ContentType || 'application/octet-stream';
    const disposition = /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf)$/.test(contentType) ? 'inline' : 'attachment';
    return new NextResponse(new Uint8Array(buffer), { headers: {
      'Content-Type': contentType, 'Content-Disposition': `${disposition}; filename="${fileName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    return new NextResponse('The uploaded file is unavailable.', { status: ['NotFound', 'NoSuchKey'].includes(name) ? 404 : 400 });
  }
}
