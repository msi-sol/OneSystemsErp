import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { uploadStorageClient, uploadBucket, putPrivateUpload, privateUploadUrl, validateUploadKey, type UploadContext } from '../../../../src/lib/s3';

export async function generateUploadUrl(key: string, contentType: string, context: UploadContext): Promise<string> {
  if (process.env.NODE_ENV !== 'production') throw new Error('Direct S3 uploads are disabled locally. Use the module upload form.');
  const command = new PutObjectCommand({
    Bucket: uploadBucket(),
    Key: validateUploadKey(key),
    ContentType: contentType,
    Metadata: { module: context.module, uploadedby: context.uploadedBy, ...(context.projectId ? { projectid: context.projectId } : {}), filename: encodeURIComponent(key.split('/').pop() || 'file') },
  });

  return getSignedUrl(uploadStorageClient(), command, { expiresIn: 900 });
}

export async function generateDownloadUrl(key: string): Promise<string> {
  validateUploadKey(key);
  if (process.env.NODE_ENV !== 'production') return privateUploadUrl(key);
  const command = new GetObjectCommand({
    Bucket: uploadBucket(),
    Key: key,
  });

  return getSignedUrl(uploadStorageClient(), command, { expiresIn: 900 });
}

export async function uploadFileToS3(buffer: Buffer, key: string, contentType: string, context: UploadContext, fileName?: string): Promise<string> {
  await putPrivateUpload(buffer, key, contentType, context, fileName);
  return key;
}
