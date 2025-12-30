import { createHash } from "crypto";
import { createReadStream } from "fs";

export async function computeHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export function computeStringHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
