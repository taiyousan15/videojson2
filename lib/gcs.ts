import { Storage } from "@google-cloud/storage";

const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET!;

export async function generateSignedUploadUrl(
  path: string,
  contentType: string = "video/mp4"
): Promise<{ signedUrl: string; gcsUri: string }> {
  const bucket = storage.bucket(BUCKET);
  const file = bucket.file(path);

  const [signedUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
    contentType,
  });

  return {
    signedUrl,
    gcsUri: `gs://${BUCKET}/${path}`,
  };
}

export async function generateSignedDownloadUrl(
  path: string,
  expiresInMinutes: number = 60
): Promise<string> {
  const bucket = storage.bucket(BUCKET);
  const file = bucket.file(path);

  const [signedUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + expiresInMinutes * 60 * 1000,
  });

  return signedUrl;
}

export function buildGcsUri(path: string): string {
  return `gs://${BUCKET}/${path}`;
}

export function parseGcsUri(uri: string): { bucket: string; path: string } {
  const match = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid GCS URI: ${uri}`);
  }
  return { bucket: match[1], path: match[2] };
}
