import { verifySession } from '@/lib/dal/auth';
import { prisma } from '@/lib/prisma';
import { getUserPermissions } from '@/lib/permissions';
import { cookies } from 'next/headers';
import { generateEmbedding } from '@/lib/ai-indexer';
import { uploadToS3 } from '@/lib/s3';
import { createHash } from 'node:crypto';
// @ts-ignore - pdf-parse types are broken
import pdfParse from 'pdf-parse';

export const maxDuration = 60; // Allow enough time for parsing and embedding

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const __session = await verifySession();
  const sessionId = __session?.id || '';
    const permissions = await getUserPermissions(sessionId);

    if (!permissions.IS_ADMIN) {
      return new Response("Unauthorized", { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const confidentiality = (formData.get('confidentiality') as string) || 'PUBLIC';

    if (!file) {
      return Response.json({ success: false, message: "No file provided." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    let content = "";
    
    if (file.name.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      content = data.text;
    } else {
      // Treat as plain text
      content = buffer.toString('utf-8');
    }

    if (!content.trim()) {
      return Response.json({ success: false, message: "Could not extract text from file." }, { status: 400 });
    }

    const original = await uploadToS3(file.name, buffer, { module: 'KNOWLEDGE_CENTER', uploadedBy: sessionId, contentType: file.type || 'application/octet-stream', adminOnly: true });
    const originalMetadata = JSON.stringify({ originalUrl: original.url, storageKey: original.pathname, fileHash: createHash('sha256').update(buffer).digest('hex'), fileSize: buffer.length });
    // Basic chunking: split by double newlines or large blocks
    const chunks = content
      .split(/\n\s*\n/)
      .map(c => c.trim())
      .filter(c => c.length > 50);

    let ingestedCount = 0;

    for (const chunk of chunks) {
      try {
        const vector = await generateEmbedding(chunk);
        
        await prisma.aiRagEmbedding.create({
          data: {
            sourceTitle: file.name,
            sourceType: file.name.endsWith('.pdf') ? 'DOCUMENT_PDF' : 'DOCUMENT_TEXT',
            sourceTextChunk: chunk.substring(0, 5000), // Safety truncation
            embeddingVector: JSON.stringify(vector),
            confidentialityLevel: confidentiality,
            metadataJson: originalMetadata,
          }
        });
        
        ingestedCount++;
      } catch (e) {
        console.error("Chunking error:", e);
      }
    }

    return Response.json({
      success: true,
      originalUrl: original.url,
      message: `Document ingested successfully. Created ${ingestedCount} vector embeddings from ${file.name}.`
    });

  } catch (error) {
    console.error("Ingest Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
