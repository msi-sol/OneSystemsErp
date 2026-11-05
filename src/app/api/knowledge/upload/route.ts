import { verifySession } from '@/lib/dal/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { chunkText, generateEmbedding } from '@/lib/ai-indexer';
import { cookies } from 'next/headers';
import { getUserPermissions } from '@/lib/permissions';
import { uploadToS3 } from '@/lib/s3';
import { createHash } from 'node:crypto';

const pdfParse = require('pdf-parse');

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const __session = await verifySession();
  const userId = __session?.id || '';
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const permissions = await getUserPermissions(userId);

    // Enforce Admin access
    if (!permissions.IS_SYSTEM_ADMIN) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const allowedRoles = formData.get('allowedRoles') as string || '[]';
    const allowedProjects = formData.get('allowedProjects') as string || '[]';
    const visibilityScope = formData.get('visibilityScope') as string || 'GLOBAL';
    const moduleName = formData.get('moduleName') as string || '';

    if (!file || !title) {
      return NextResponse.json({ error: "Missing file or title" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    let textContent = "";
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const pdfData = await pdfParse(buffer);
      textContent = pdfData.text;
    } else {
      textContent = buffer.toString('utf-8');
    }

    if (!textContent || textContent.trim().length === 0) {
      return NextResponse.json({ error: "Could not extract readable text from this file." }, { status: 400 });
    }

    // Original binaries remain restricted to the uploading administrator/admins;
    // existing per-role/project rules continue governing indexed knowledge chunks.
    const original = await uploadToS3(file.name, buffer, { module: 'KNOWLEDGE_CENTER', uploadedBy: userId, contentType: file.type || 'application/octet-stream', adminOnly: true });
    // Create the Knowledge Source record
    const source = await prisma.aiKnowledgeSource.create({
      data: {
        sourceType: 'uploaded_file',
        title,
        originalFilename: file.name,
        filePath: `s3:${original.pathname}`,
        storageUrl: original.url,
        mimeType: file.type,
        uploadedById: userId,
        visibilityScope,
        allowedRoles,
        allowedProjects,
        moduleName,
      }
    });

    await prisma.auditLog.create({ data: { userId, userRole: __session!.role, moduleName: 'KNOWLEDGE_CENTER', transactionId: source.id, actionType: 'KNOWLEDGE_ORIGINAL_STORED', newValue: JSON.stringify({ sourceId: source.id, storageKey: original.pathname, originalUrl: original.url, fileHash: createHash('sha256').update(buffer).digest('hex'), fileSize: buffer.length }) } });
    const chunks = chunkText(textContent);
    let chunksProcessed = 0;
    
    // Process chunks sequentially to respect OpenAI rate limits
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await generateEmbedding(chunks[i]);
        await prisma.aiKnowledgeChunk.create({
          data: {
            sourceId: source.id,
            chunkIndex: i,
            chunkText: chunks[i],
            vectorEmbedding: JSON.stringify(embedding),
            tokenCount: Math.ceil(chunks[i].length / 4), 
            moduleName,
            allowedRoles,
            visibilityScope
          }
        });
        chunksProcessed++;
      } catch (embedError) {
        console.error(`Error embedding chunk ${i}:`, embedError);
        // Continue indexing remaining chunks even if one fails
      }
    }

    await prisma.aiKnowledgeSource.update({
      where: { id: source.id },
      data: { indexedAt: new Date() }
    });

    return NextResponse.json({ 
      success: true, 
      sourceId: source.id, 
      originalUrl: original.url,
      chunksProcessed,
      totalChunks: chunks.length 
    });
  } catch (error: any) {
    console.error("Upload & Index error:", error);
    return NextResponse.json({ error: error.message || "Internal server error during indexing." }, { status: 500 });
  }
}
