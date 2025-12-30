/**
 * Structured Logger (JSON format)
 *
 * P2: Cloud Logging compatible structured logging
 *
 * Output format is compatible with Google Cloud Logging (severity field)
 * and also works with standard JSON log parsers.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export interface LogContext {
  jobId?: string;
  videoId?: string;
  projectId?: string;
  taskType?: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  severity: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  labels?: Record<string, string>;
  // GCP Cloud Logging specific fields
  "logging.googleapis.com/trace"?: string;
  "logging.googleapis.com/spanId"?: string;
}

// Environment-based log level
const LOG_LEVEL_ORDER: LogLevel[] = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"];

function getMinLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase() as LogLevel;
  if (LOG_LEVEL_ORDER.includes(envLevel)) {
    return envLevel;
  }
  return process.env.NODE_ENV === "production" ? "INFO" : "DEBUG";
}

function shouldLog(level: LogLevel): boolean {
  const minLevel = getMinLogLevel();
  return LOG_LEVEL_ORDER.indexOf(level) >= LOG_LEVEL_ORDER.indexOf(minLevel);
}

function formatError(error: unknown): LogEntry["error"] | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "Unknown",
    message: String(error),
  };
}

function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    severity: level,
    message,
  };

  if (context && Object.keys(context).length > 0) {
    // Extract GCP-specific fields
    if (context.traceId) {
      entry["logging.googleapis.com/trace"] = context.traceId;
    }
    if (context.spanId) {
      entry["logging.googleapis.com/spanId"] = context.spanId;
    }

    // Remove trace fields from context
    const { traceId, spanId, ...restContext } = context;
    if (Object.keys(restContext).length > 0) {
      entry.context = restContext as LogContext;
    }
  }

  if (error) {
    entry.error = formatError(error);
  }

  return entry;
}

function writeLog(entry: LogEntry): void {
  const output = JSON.stringify(entry);

  // Use stderr for ERROR and CRITICAL
  if (entry.severity === "ERROR" || entry.severity === "CRITICAL") {
    process.stderr.write(output + "\n");
  } else {
    process.stdout.write(output + "\n");
  }
}

/**
 * Logger class with context binding
 */
export class Logger {
  private baseContext: LogContext;
  private labels: Record<string, string>;

  constructor(context: LogContext = {}, labels: Record<string, string> = {}) {
    this.baseContext = context;
    this.labels = labels;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext, labels?: Record<string, string>): Logger {
    return new Logger(
      { ...this.baseContext, ...context },
      { ...this.labels, ...labels }
    );
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: unknown): void {
    if (!shouldLog(level)) return;

    const mergedContext = { ...this.baseContext, ...context };
    const entry = createLogEntry(level, message, mergedContext, error);

    if (Object.keys(this.labels).length > 0) {
      entry.labels = this.labels;
    }

    writeLog(entry);
  }

  debug(message: string, context?: LogContext): void {
    this.log("DEBUG", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("INFO", message, context);
  }

  warn(message: string, context?: LogContext, error?: unknown): void {
    this.log("WARNING", message, context, error);
  }

  error(message: string, context?: LogContext, error?: unknown): void {
    this.log("ERROR", message, context, error);
  }

  critical(message: string, context?: LogContext, error?: unknown): void {
    this.log("CRITICAL", message, context, error);
  }

  /**
   * Log job lifecycle events
   */
  jobStarted(jobId: string, jobType: string, extra?: LogContext): void {
    this.info(`Job started: ${jobType}`, { jobId, taskType: jobType, ...extra });
  }

  jobCompleted(jobId: string, jobType: string, durationMs: number, extra?: LogContext): void {
    this.info(`Job completed: ${jobType}`, { jobId, taskType: jobType, durationMs, ...extra });
  }

  jobFailed(jobId: string, jobType: string, error: unknown, extra?: LogContext): void {
    this.error(`Job failed: ${jobType}`, { jobId, taskType: jobType, ...extra }, error);
  }

  jobProgress(jobId: string, progress: number, step?: string): void {
    this.debug(`Job progress: ${progress}%`, { jobId, progress, step });
  }

  /**
   * Log HTTP request/response
   */
  httpRequest(method: string, path: string, statusCode: number, durationMs: number, extra?: LogContext): void {
    const level: LogLevel = statusCode >= 500 ? "ERROR" : statusCode >= 400 ? "WARNING" : "INFO";
    this.log(level, `${method} ${path} ${statusCode}`, {
      httpMethod: method,
      httpPath: path,
      httpStatus: statusCode,
      durationMs,
      ...extra,
    });
  }

  /**
   * Log external service calls
   */
  externalCall(service: string, operation: string, durationMs: number, success: boolean, extra?: LogContext): void {
    const level: LogLevel = success ? "INFO" : "ERROR";
    this.log(level, `External call: ${service}.${operation}`, {
      service,
      operation,
      durationMs,
      success,
      ...extra,
    });
  }
}

// Default logger instance
export const logger = new Logger(
  {},
  {
    service: "videojson-worker",
    version: process.env.npm_package_version || "1.0.0",
  }
);

/**
 * Create a request-scoped logger with trace context
 */
export function createRequestLogger(
  traceId?: string,
  spanId?: string,
  extra?: LogContext
): Logger {
  return logger.child({
    traceId,
    spanId,
    ...extra,
  });
}

/**
 * Create a job-scoped logger
 */
export function createJobLogger(
  jobId: string,
  jobType: string,
  videoId?: string,
  projectId?: string
): Logger {
  return logger.child({
    jobId,
    taskType: jobType,
    videoId,
    projectId,
  });
}

/**
 * Express middleware for request logging
 */
export function requestLoggingMiddleware() {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();

    // Extract trace context from headers (Cloud Run / Cloud Functions)
    const traceHeader = req.headers["x-cloud-trace-context"] as string;
    let traceId: string | undefined;
    let spanId: string | undefined;

    if (traceHeader) {
      const [trace, span] = traceHeader.split("/");
      const projectId = process.env.GOOGLE_CLOUD_PROJECT;
      if (projectId && trace) {
        traceId = `projects/${projectId}/traces/${trace}`;
        spanId = span?.split(";")[0];
      }
    }

    // Attach logger to request
    req.logger = createRequestLogger(traceId, spanId);

    // Log response on finish
    res.on("finish", () => {
      const durationMs = Date.now() - startTime;
      req.logger.httpRequest(
        req.method,
        req.originalUrl || req.url,
        res.statusCode,
        durationMs
      );
    });

    next();
  };
}

// Legacy console.log replacement helpers
export const log = {
  debug: (message: string, context?: LogContext) => logger.debug(message, context),
  info: (message: string, context?: LogContext) => logger.info(message, context),
  warn: (message: string, context?: LogContext, error?: unknown) => logger.warn(message, context, error),
  error: (message: string, context?: LogContext, error?: unknown) => logger.error(message, context, error),
};
