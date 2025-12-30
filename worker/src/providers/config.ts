/**
 * Provider Configuration - 各AIプロバイダーの設定管理
 */

export interface ProviderConfig {
  // Video Understanding
  twelvelabs: {
    apiKey: string;
    indexId: string;
    apiUrl: string;
  };

  // Multimodal LLM
  gemini: {
    apiKey: string;
    model: string;
  };

  // Text LLM
  anthropic: {
    apiKey: string;
    model: string;
    baseUrl: string;
    isOpenRouter: boolean;
  };

  openai: {
    apiKey: string;
    model: string;
    whisperModel: string;
    baseUrl: string;
    isOpenRouter: boolean;
    openRouterSiteName?: string;
    openRouterSiteUrl?: string;
  };

  // TTS
  elevenlabs: {
    apiKey: string;
    defaultVoice: string;
  };

  // Video Generation
  runway: {
    apiKey: string;
  };

  // Image Generation
  replicate: {
    apiToken: string;
    fluxModel: string;
  };

  // Cloud Storage
  gcs: {
    projectId: string;
    bucket: string;
    credentialsPath?: string;
  };
}

export function loadConfig(): ProviderConfig {
  return {
    twelvelabs: {
      apiKey: process.env.TWELVELABS_API_KEY || "",
      indexId: process.env.TWELVELABS_INDEX_ID || "",
      apiUrl: "https://api.twelvelabs.io/v1.2",
    },

    gemini: {
      apiKey: process.env.GOOGLE_AI_API_KEY || "",
      model: "gemini-2.0-flash-exp",
    },

    anthropic: {
      apiKey: process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || "",
      model: process.env.OPENROUTER_API_KEY
        ? "anthropic/claude-3.5-sonnet"
        : "claude-3-5-sonnet-20241022",
      baseUrl: process.env.OPENROUTER_API_KEY
        ? "https://openrouter.ai/api/v1"
        : "https://api.anthropic.com/v1",
      isOpenRouter: !!process.env.OPENROUTER_API_KEY,
    },

    openai: {
      apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "",
      model: process.env.OPENROUTER_API_KEY ? "openai/gpt-4o" : "gpt-4o",
      whisperModel: "whisper-1",
      baseUrl: process.env.OPENROUTER_API_KEY
        ? "https://openrouter.ai/api/v1"
        : (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"),
      isOpenRouter: !!process.env.OPENROUTER_API_KEY,
      openRouterSiteName: process.env.OPENROUTER_SITE_NAME,
      openRouterSiteUrl: process.env.OPENROUTER_SITE_URL,
    },

    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY || "",
      defaultVoice: "21m00Tcm4TlvDq8ikWAM", // Rachel
    },

    runway: {
      apiKey: process.env.RUNWAY_API_KEY || "",
    },

    replicate: {
      apiToken: process.env.REPLICATE_API_TOKEN || "",
      fluxModel: "black-forest-labs/flux-1.1-pro",
    },

    gcs: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || "",
      bucket: process.env.GCS_BUCKET || "",
      credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    },
  };
}

export function validateConfig(config: ProviderConfig): {
  valid: boolean;
  missing: string[];
  available: string[];
} {
  const missing: string[] = [];
  const available: string[] = [];

  // Check TwelveLabs
  if (config.twelvelabs.apiKey && config.twelvelabs.indexId) {
    available.push("twelvelabs");
  } else {
    missing.push("twelvelabs");
  }

  // Check Gemini
  if (config.gemini.apiKey) {
    available.push("gemini");
  } else {
    missing.push("gemini");
  }

  // Check Anthropic
  if (config.anthropic.apiKey) {
    available.push("anthropic");
  } else {
    missing.push("anthropic");
  }

  // Check OpenAI
  if (config.openai.apiKey) {
    available.push("openai");
  } else {
    missing.push("openai");
  }

  // Check ElevenLabs
  if (config.elevenlabs.apiKey) {
    available.push("elevenlabs");
  } else {
    missing.push("elevenlabs");
  }

  // Check Runway
  if (config.runway.apiKey) {
    available.push("runway");
  } else {
    missing.push("runway");
  }

  // Check Replicate
  if (config.replicate.apiToken) {
    available.push("replicate");
  } else {
    missing.push("replicate");
  }

  // Check GCS
  if (config.gcs.projectId && config.gcs.bucket) {
    available.push("gcs");
  } else {
    missing.push("gcs");
  }

  return {
    valid: available.length >= 3, // At least need LLM + storage + one analysis
    missing,
    available,
  };
}

// Singleton config instance
let configInstance: ProviderConfig | null = null;

export function getConfig(): ProviderConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function reloadConfig(): ProviderConfig {
  configInstance = loadConfig();
  return configInstance;
}
