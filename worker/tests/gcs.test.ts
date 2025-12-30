import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @google-cloud/storage
const mockFile = {
  download: vi.fn().mockResolvedValue([Buffer.from('{"test": "data"}')]),
  save: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue([true]),
};

const mockBucket = {
  file: vi.fn(() => mockFile),
  upload: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@google-cloud/storage", () => {
  return {
    Storage: class MockStorage {
      bucket() {
        return mockBucket;
      }
    },
  };
});

describe("GCS Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseGcsUri", () => {
    it("should parse valid GCS URI", async () => {
      const { parseGcsUri } = await import("../src/utils/gcs");

      const result = parseGcsUri("gs://my-bucket/path/to/file.mp4");

      expect(result.bucket).toBe("my-bucket");
      expect(result.path).toBe("path/to/file.mp4");
    });

    it("should throw error for invalid URI", async () => {
      const { parseGcsUri } = await import("../src/utils/gcs");

      expect(() => parseGcsUri("invalid-uri")).toThrow("Invalid GCS URI");
      expect(() => parseGcsUri("s3://bucket/path")).toThrow("Invalid GCS URI");
    });

    it("should handle bucket-only paths", async () => {
      const { parseGcsUri } = await import("../src/utils/gcs");

      const result = parseGcsUri("gs://bucket/file.txt");

      expect(result.bucket).toBe("bucket");
      expect(result.path).toBe("file.txt");
    });
  });

  describe("buildGcsUri", () => {
    it("should build valid GCS URI", async () => {
      const { buildGcsUri } = await import("../src/utils/gcs");

      const result = buildGcsUri("my-bucket", "path/to/file.mp4");

      expect(result).toBe("gs://my-bucket/path/to/file.mp4");
    });
  });

  describe("getDefaultBucket", () => {
    it("should return default bucket from env or fallback", async () => {
      const { getDefaultBucket } = await import("../src/utils/gcs");

      const result = getDefaultBucket();

      // Either from env or fallback
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("downloadJSON", () => {
    it("should download and parse JSON from GCS", async () => {
      const { downloadJSON } = await import("../src/utils/gcs");

      const result = await downloadJSON("gs://bucket/file.json");

      expect(result).toEqual({ test: "data" });
    });
  });

  describe("uploadJSON", () => {
    it("should upload JSON to GCS", async () => {
      const { uploadJSON } = await import("../src/utils/gcs");

      await uploadJSON("gs://bucket/output.json", { key: "value" });

      expect(mockFile.save).toHaveBeenCalledWith(
        JSON.stringify({ key: "value" }, null, 2),
        expect.objectContaining({ contentType: "application/json" })
      );
    });
  });

  describe("fileExists", () => {
    it("should check if file exists", async () => {
      const { fileExists } = await import("../src/utils/gcs");

      const result = await fileExists("gs://bucket/file.txt");

      expect(result).toBe(true);
    });
  });
});
