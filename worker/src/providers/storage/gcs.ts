import { Storage } from "@google-cloud/storage";

const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET!;

export async function downloadFile(gcsUri: string, localPath: string): Promise<void> {
  const { bucket, path } = parseGcsUri(gcsUri);
  await storage.bucket(bucket).file(path).download({ destination: localPath });
}

export async function uploadFile(localPath: string, gcsPath: string): Promise<string> {
  await storage.bucket(BUCKET).upload(localPath, { destination: gcsPath });
  return `gs://${BUCKET}/${gcsPath}`;
}

export async function readJson<T>(gcsUri: string): Promise<T> {
  const { bucket, path } = parseGcsUri(gcsUri);
  const [content] = await storage.bucket(bucket).file(path).download();
  return JSON.parse(content.toString());
}

export async function writeJson(gcsPath: string, data: object): Promise<string> {
  const content = JSON.stringify(data, null, 2);
  await storage.bucket(BUCKET).file(gcsPath).save(content, {
    contentType: "application/json",
  });
  return `gs://${BUCKET}/${gcsPath}`;
}

function parseGcsUri(uri: string): { bucket: string; path: string } {
  const match = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) throw new Error(`Invalid GCS URI: ${uri}`);
  return { bucket: match[1], path: match[2] };
}
