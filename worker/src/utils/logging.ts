type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  jobId?: string;
  videoId?: string;
  stage?: string;
  [key: string]: any;
}

class Logger {
  private minLevel: LogLevel;

  constructor() {
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || "info";
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private format(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog("debug")) {
      console.debug(this.format("debug", message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog("info")) {
      console.info(this.format("info", message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog("warn")) {
      console.warn(this.format("warn", message, context));
    }
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (this.shouldLog("error")) {
      const errorContext = error
        ? { ...context, error: error.message, stack: error.stack }
        : context;
      console.error(this.format("error", message, errorContext));
    }
  }
}

export const logger = new Logger();
