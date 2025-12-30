import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Capture stdout/stderr
let stdoutOutput: string[] = [];
let stderrOutput: string[] = [];

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

describe("Logger", () => {
  beforeEach(() => {
    stdoutOutput = [];
    stderrOutput = [];
    process.stdout.write = (chunk: any) => {
      stdoutOutput.push(chunk.toString());
      return true;
    };
    process.stderr.write = (chunk: any) => {
      stderrOutput.push(chunk.toString());
      return true;
    };
    vi.resetModules();
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  });

  describe("Logger class", () => {
    it("should output JSON formatted logs", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      logger.info("Test message");

      expect(stdoutOutput.length).toBe(1);
      const log = JSON.parse(stdoutOutput[0]);
      expect(log.severity).toBe("INFO");
      expect(log.message).toBe("Test message");
      expect(log.timestamp).toBeDefined();
    });

    it("should include context in logs", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      logger.info("Test message", { jobId: "job123", videoId: "video456" });

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.context.jobId).toBe("job123");
      expect(log.context.videoId).toBe("video456");
    });

    it("should create child logger with inherited context", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const parentLogger = new Logger({ projectId: "proj123" });
      const childLogger = parentLogger.child({ jobId: "job456" });

      childLogger.info("Child message");

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.context.projectId).toBe("proj123");
      expect(log.context.jobId).toBe("job456");
    });

    it("should output ERROR and CRITICAL to stderr", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      logger.error("Error message");
      logger.critical("Critical message");

      expect(stderrOutput.length).toBe(2);
      expect(JSON.parse(stderrOutput[0]).severity).toBe("ERROR");
      expect(JSON.parse(stderrOutput[1]).severity).toBe("CRITICAL");
    });

    it("should include error details", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      const error = new Error("Something went wrong");
      logger.error("Failed operation", undefined, error);

      const log = JSON.parse(stderrOutput[0]);
      expect(log.error.name).toBe("Error");
      expect(log.error.message).toBe("Something went wrong");
      expect(log.error.stack).toBeDefined();
    });

    it("should support all log levels", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      logger.debug("Debug message");
      logger.info("Info message");
      logger.warn("Warning message");
      logger.error("Error message");
      logger.critical("Critical message");

      // Debug + Info + Warn go to stdout
      expect(stdoutOutput.length).toBe(3);
      // Error + Critical go to stderr
      expect(stderrOutput.length).toBe(2);
    });
  });

  describe("Job lifecycle logging", () => {
    it("should log job started", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      logger.jobStarted("job123", "INGEST");

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.message).toContain("Job started");
      expect(log.context.jobId).toBe("job123");
      expect(log.context.taskType).toBe("INGEST");
    });

    it("should log job completed with duration", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      logger.jobCompleted("job123", "ANALYZE", 5000);

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.message).toContain("Job completed");
      expect(log.context.durationMs).toBe(5000);
    });

    it("should log job failed with error", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      const error = new Error("Processing failed");
      logger.jobFailed("job123", "RENDER", error);

      const log = JSON.parse(stderrOutput[0]);
      expect(log.message).toContain("Job failed");
      expect(log.error.message).toBe("Processing failed");
    });

    it("should log job progress", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      logger.jobProgress("job123", 50, "Processing frames");

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.context.progress).toBe(50);
      expect(log.context.step).toBe("Processing frames");
    });
  });

  describe("HTTP request logging", () => {
    it("should log successful HTTP request", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      logger.httpRequest("GET", "/api/jobs/123", 200, 150);

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.severity).toBe("INFO");
      expect(log.context.httpMethod).toBe("GET");
      expect(log.context.httpPath).toBe("/api/jobs/123");
      expect(log.context.httpStatus).toBe(200);
      expect(log.context.durationMs).toBe(150);
    });

    it("should log 4xx as WARNING", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      logger.httpRequest("POST", "/api/webhooks", 400, 50);

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.severity).toBe("WARNING");
    });

    it("should log 5xx as ERROR", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      logger.httpRequest("GET", "/api/jobs/123", 500, 100);

      const log = JSON.parse(stderrOutput[0]);
      expect(log.severity).toBe("ERROR");
    });
  });

  describe("External call logging", () => {
    it("should log successful external call", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      logger.externalCall("ComfyUI", "generateImage", 2000, true);

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.context.service).toBe("ComfyUI");
      expect(log.context.operation).toBe("generateImage");
      expect(log.context.success).toBe(true);
    });

    it("should log failed external call as ERROR", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      logger.externalCall("GCS", "uploadFile", 500, false);

      const log = JSON.parse(stderrOutput[0]);
      expect(log.severity).toBe("ERROR");
      expect(log.context.success).toBe(false);
    });
  });

  describe("GCP Cloud Logging compatibility", () => {
    it("should extract trace context to GCP fields", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger();

      logger.info("Traced message", {
        traceId: "projects/my-project/traces/abc123",
        spanId: "def456",
      });

      const log = JSON.parse(stdoutOutput[0]);
      expect(log["logging.googleapis.com/trace"]).toBe("projects/my-project/traces/abc123");
      expect(log["logging.googleapis.com/spanId"]).toBe("def456");
      // Trace fields should not appear in context
      expect(log.context?.traceId).toBeUndefined();
      expect(log.context?.spanId).toBeUndefined();
    });
  });

  describe("Factory functions", () => {
    it("should create request logger with trace context", async () => {
      const { createRequestLogger } = await import("../../src/utils/logger");

      const logger = createRequestLogger("trace123", "span456", { userId: "user1" });
      logger.info("Request log");

      const log = JSON.parse(stdoutOutput[0]);
      expect(log["logging.googleapis.com/trace"]).toBe("trace123");
      expect(log.context.userId).toBe("user1");
    });

    it("should create job logger with job context", async () => {
      const { createJobLogger } = await import("../../src/utils/logger");

      const logger = createJobLogger("job123", "INGEST", "video456", "proj789");
      logger.info("Job log");

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.context.jobId).toBe("job123");
      expect(log.context.taskType).toBe("INGEST");
      expect(log.context.videoId).toBe("video456");
      expect(log.context.projectId).toBe("proj789");
    });
  });

  describe("Labels", () => {
    it("should include labels in log output", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const logger = new Logger({}, { service: "test-service", version: "1.0.0" });

      logger.info("Labeled message");

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.labels.service).toBe("test-service");
      expect(log.labels.version).toBe("1.0.0");
    });

    it("should merge labels in child logger", async () => {
      const { Logger } = await import("../../src/utils/logger");
      const parent = new Logger({}, { service: "parent" });
      const child = parent.child({}, { component: "child" });

      child.info("Child message");

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.labels.service).toBe("parent");
      expect(log.labels.component).toBe("child");
    });
  });
});
