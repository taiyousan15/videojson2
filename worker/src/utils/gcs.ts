/**
 * GCS Utilities - Google Cloud Storage共通処理
 */

import { Storage } from "@google-cloud/storage";

const storage = new Storage();

/**
 * Parse GCS URI into bucket and path
 */
export function parseGcsUri(gcsUri: string): { bucket: string; path: string } {
  const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error("Invalid GCS URI: " + gcsUri);
  }
  return { bucket: match[1], path: match[2] };
}

/**
 * Download JSON from GCS
 */
export async function downloadJSON<T = any>(gcsUri: string): Promise<T> {
  const { bucket, path } = parseGcsUri(gcsUri);
  const [content] = await storage.bucket(bucket).file(path).download();
  return JSON.parse(content.toString()) as T;
}

/**
 * Upload JSON to GCS
 */
export async function uploadJSON(
  gcsUri: string,
  data: any,
  options?: { contentType?: string }
): Promise<void> {
  const { bucket, path } = parseGcsUri(gcsUri);
  const content = JSON.stringify(data, null, 2);
  await storage.bucket(bucket).file(path).save(content, {
    contentType: options?.contentType || "application/json",
  });
}

/**
 * Download file from GCS to local path
 */
export async function downloadFile(gcsUri: string, destination: string): Promise<void> {
  const { bucket, path } = parseGcsUri(gcsUri);
  await storage.bucket(bucket).file(path).download({ destination });
}

/**
 * Upload file to GCS
 */
export async function uploadFile(
  localPath: string,
  gcsUri: string,
  options?: { contentType?: string }
): Promise<void> {
  const { bucket, path } = parseGcsUri(gcsUri);
  await storage.bucket(bucket).upload(localPath, {
    destination: path,
    metadata: options?.contentType ? { contentType: options.contentType } : undefined,
  });
}

/**
 * Check if file exists in GCS
 */
export async function fileExists(gcsUri: string): Promise<boolean> {
  const { bucket, path } = parseGcsUri(gcsUri);
  const [exists] = await storage.bucket(bucket).file(path).exists();
  return exists;
}

/**
 * Get default bucket name from environment
 */
export function getDefaultBucket(): string {
  return process.env.GCS_BUCKET || "videojson-artifacts";
}

/**
 * Build GCS URI from bucket and path
 */
export function buildGcsUri(bucket: string, path: string): string {
  return "gs://" + bucket + "/" + path;
}
