import "server-only";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  S3Client,
  UploadPartCommand,
  type GetObjectCommandInput,
  type UploadPartCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getEnv } from "@/lib/env";

/**
 * Neon Object Storage client (S3-compatible). All operations are server-side
 * only — the browser never holds AWS credentials. Presigned URLs mint per
 * request after authz; never stored, never returned to the client except as a
 * one-time PUT/GET URL.
 *
 * Lazy env access means `next build` succeeds without storage secrets.
 */
const MAX_PART_SIZE = 5 * 1024 * 1024 * 1024; // 5 GiB single PUT cap (Neon)
const MULTIPART_MAX = 10 * 1024 * 1024 * 1024; // 10 GiB multipart cap (Neon)

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;

  const env = getEnv();

  client = new S3Client({
    endpoint: env.NEON_STORAGE_ENDPOINT,
    region: env.NEON_STORAGE_REGION,
    credentials: {
      accessKeyId: env.NEON_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.NEON_STORAGE_SECRET_ACCESS_KEY,
    },
    // Neon Object Storage is S3-compatible; path-style addressing is required.
    forcePathStyle: true,
  });

  return client;
}

export type StorageConfig = {
  bucket: string;
  region: string;
};

export function storageConfig(): StorageConfig {
  const env = getEnv();

  return {
    bucket: env.NEON_STORAGE_BUCKET_NAME,
    region: env.NEON_STORAGE_REGION,
  };
}

/** Object key convention: rooms/{roomId}/recordings/{recordingId}.webm */
export function recordingKey(roomId: string, recordingId: string): string {
  return `rooms/${roomId}/recordings/${recordingId}.webm`;
}

/**
 * Initiate a multipart upload for one recording. Returns the uploadId the
 * client uses to PUT every part directly to Neon.
 */
export async function initMultipartUpload({
  roomId,
  recordingId,
  mimeType,
}: {
  roomId: string;
  recordingId: string;
  mimeType: string;
}): Promise<{ uploadId: string }> {
  const env = getEnv();

  const command = new CreateMultipartUploadCommand({
    Bucket: env.NEON_STORAGE_BUCKET_NAME,
    Key: recordingKey(roomId, recordingId),
    ContentType: mimeType,
  });

  const result = await getClient().send(command);

  if (!result.UploadId) {
    throw new Error("Neon did not return an uploadId.");
  }

  return { uploadId: result.UploadId };
}

/**
 * Presign a PUT URL for uploading one part. TTL is 15 minutes. The client
 * PUTs the part bytes directly to Neon — never through this server.
 */
export async function presignPutPart({
  uploadId,
  roomId,
  recordingId,
  partNumber,
}: {
  uploadId: string;
  roomId: string;
  recordingId: string;
  partNumber: number;
}): Promise<{ url: string; ttlSeconds: number }> {
  const env = getEnv();

  const command = new UploadPartCommand({
    Bucket: env.NEON_STORAGE_BUCKET_NAME,
    Key: recordingKey(roomId, recordingId),
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  const url = await getSignedUrl(getClient(), command, {
    expiresIn: 15 * 60, // 15 min TTL
  });

  return { url, ttlSeconds: 15 * 60 };
}

/**
 * Complete the multipart upload. Returns the storageKey (never a URL — URLs
 * are minted per request after authz, see errata #4).
 */
export async function completeMultipartUpload({
  uploadId,
  roomId,
  recordingId,
  parts,
}: {
  uploadId: string;
  roomId: string;
  recordingId: string;
  parts: Array<{ PartNumber: number; ETag: string }>;
}): Promise<{ storageKey: string }> {
  const env = getEnv();

  const command = new CompleteMultipartUploadCommand({
    Bucket: env.NEON_STORAGE_BUCKET_NAME,
    Key: recordingKey(roomId, recordingId),
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  });

  await getClient().send(command);

  return { storageKey: recordingKey(roomId, recordingId) };
}

/**
 * Presign a GET URL for playback. TTL is 5 minutes, Range-enabled for seeking.
 * Callers must check membership before minting.
 */
export async function presignGetObject({
  storageKey,
}: {
  storageKey: string;
}): Promise<{ url: string; ttlSeconds: number }> {
  const env = getEnv();

  const command = new GetObjectCommand({
    Bucket: env.NEON_STORAGE_BUCKET_NAME,
    Key: storageKey,
  });

  const url = await getSignedUrl(getClient(), command, {
    expiresIn: 5 * 60, // 5 min TTL
  });

  return { url, ttlSeconds: 5 * 60 };
}

/**
 * Abort an in-progress multipart upload (room ended without complete).
 */
export async function abortMultipartUpload({
  uploadId,
  roomId,
  recordingId,
}: {
  uploadId: string;
  roomId: string;
  recordingId: string;
}): Promise<void> {
  const env = getEnv();

  const command = new AbortMultipartUploadCommand({
    Bucket: env.NEON_STORAGE_BUCKET_NAME,
    Key: recordingKey(roomId, recordingId),
    UploadId: uploadId,
  });

  await getClient().send(command);
}

/** Exported for tests that need to construct commands directly. */
export { S3Client, GetObjectCommand, UploadPartCommand, CompleteMultipartUploadCommand };
export type { GetObjectCommandInput, UploadPartCommandInput };
export { MAX_PART_SIZE, MULTIPART_MAX };
