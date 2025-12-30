/**
 * Environment Variable Validation
 *
 * P2: 起動時に必須環境変数をチェック
 */

export interface EnvConfig {
  // Required
  DATABASE_URL: string;

  // Optional with defaults
  PORT: string;
  NODE_ENV: string;
  GCS_BUCKET: string;

  // Optional service endpoints
  COMFYUI_URL?: string;
  INSIGHTFACE_ENDPOINT?: string;

  // Optional API keys (required for specific features)
  GOOGLE_CLOUD_PROJECT?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_AI_API_KEY?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  config: Partial<EnvConfig>;
}

/**
 * Validate environment variables at startup
 */
export function validateEnv(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config: Partial<EnvConfig> = {};

  // Required environment variables
  const required: (keyof EnvConfig)[] = ["DATABASE_URL"];

  for (const key of required) {
    const value = process.env[key];
    if (!value) {
      errors.push(`Missing required environment variable: ${key}`);
    } else {
      config[key] = value;
    }
  }

  // Validate DATABASE_URL format
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("postgresql://")) {
    errors.push("DATABASE_URL must be a valid PostgreSQL connection string");
  }

  // Optional with defaults
  config.PORT = process.env.PORT || "8080";
  config.NODE_ENV = process.env.NODE_ENV || "development";
  config.GCS_BUCKET = process.env.GCS_BUCKET || "videojson-artifacts";

  // Warn if default values are used in production
  if (config.NODE_ENV === "production") {
    if (!process.env.GCS_BUCKET) {
      warnings.push("GCS_BUCKET not set, using default 'videojson-artifacts'");
    }
  }

  // Optional service endpoints
  if (process.env.COMFYUI_URL) {
    config.COMFYUI_URL = process.env.COMFYUI_URL;
    // Validate URL format
    try {
      new URL(config.COMFYUI_URL);
    } catch {
      errors.push("COMFYUI_URL must be a valid URL");
    }
  }

  if (process.env.INSIGHTFACE_ENDPOINT) {
    config.INSIGHTFACE_ENDPOINT = process.env.INSIGHTFACE_ENDPOINT;
  }

  // Optional API keys
  config.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
  config.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  config.GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;

  // Warnings for missing optional but recommended keys
  if (config.NODE_ENV === "production") {
    if (!config.GOOGLE_CLOUD_PROJECT) {
      warnings.push("GOOGLE_CLOUD_PROJECT not set - some GCS features may not work");
    }
    if (!config.GOOGLE_AI_API_KEY && !config.OPENAI_API_KEY) {
      warnings.push("No AI API key set (GOOGLE_AI_API_KEY or OPENAI_API_KEY) - AI features disabled");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    config,
  };
}

/**
 * Log validation results
 */
export function logValidationResults(result: ValidationResult): void {
  if (result.errors.length > 0) {
    console.error("[Config] Validation errors:");
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
  }

  if (result.warnings.length > 0) {
    console.warn("[Config] Validation warnings:");
    for (const warning of result.warnings) {
      console.warn(`  - ${warning}`);
    }
  }

  if (result.valid) {
    console.log("[Config] Environment validation passed");
    console.log(`[Config] NODE_ENV: ${result.config.NODE_ENV}`);
    console.log(`[Config] PORT: ${result.config.PORT}`);
    console.log(`[Config] GCS_BUCKET: ${result.config.GCS_BUCKET}`);
  }
}

/**
 * Validate and exit if invalid
 */
export function validateEnvOrExit(): EnvConfig {
  const result = validateEnv();
  logValidationResults(result);

  if (!result.valid) {
    console.error("[Config] Environment validation failed. Exiting.");
    process.exit(1);
  }

  return result.config as EnvConfig;
}
