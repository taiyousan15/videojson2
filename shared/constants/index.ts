// Job Types
export const JOB_TYPES = [
  "INGEST",
  "ANALYZE",
  "OCR",
  "EMBED",
  "HIGHLIGHT",
  "RENDER",
  "ASSEMBLE",
  "TRAIN",
] as const;

// Job Statuses
export const JOB_STATUSES = [
  "PENDING",
  "QUEUED",
  "RUNNING",
  "WAITING_EXTERNAL",
  "REVIEW_REQUIRED",
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
] as const;

// Queue Names
export const QUEUES = {
  CPU: "cpu-queue",
  GPU: "gpu-queue",
} as const;

// Job to Queue mapping
export const JOB_QUEUE_MAP: Record<string, string> = {
  INGEST: QUEUES.CPU,
  ANALYZE: QUEUES.CPU,
  OCR: QUEUES.CPU, // Can be GPU with PaddleOCR
  EMBED: QUEUES.GPU,
  HIGHLIGHT: QUEUES.CPU,
  RENDER: QUEUES.GPU,
  ASSEMBLE: QUEUES.CPU,
  TRAIN: QUEUES.GPU,
};

// Embedding Thresholds
export const EMBEDDING_THRESHOLDS = {
  AUTO_MERGE: 0.65,
  REVIEW_MIN: 0.55,
  DIFFERENT: 0.55,
} as const;

// GCS Paths
export const GCS_PATHS = {
  VIDEOS: "videos",
  ARTIFACTS: "artifacts",
  OUTPUTS: "outputs",
  TEMP: "temp",
} as const;

// Artifact Types
export const ARTIFACT_TYPES = [
  "SOURCE_VIDEO",
  "NORMALIZED_VIDEO",
  "EVENT_JSON",
  "AUTHORING_JSON",
  "PLAN_JSON",
  "STATE_JSON",
  "OUTPUT_VIDEO",
  "THUMBNAIL",
  "ASS_SUBTITLE",
  "OCR_REPORT",
  "EMBED_REPORT",
  "HIGHLIGHT_PLAN",
] as const;

// Video Formats
export const VIDEO_FORMATS = {
  NORMALIZED: {
    CODEC: "libx264",
    PRESET: "medium",
    CRF: 23,
    AUDIO_CODEC: "aac",
    AUDIO_BITRATE: "128k",
  },
  OUTPUT: {
    CODEC: "libx264",
    PRESET: "slow",
    CRF: 18,
    AUDIO_CODEC: "aac",
    AUDIO_BITRATE: "192k",
  },
} as const;

// Aspect Ratios
export const ASPECT_RATIOS = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
} as const;

// Provider Names
export const PROVIDERS = {
  VIDEO_ANALYSIS: "twelvelabs",
  OCR: {
    PRIMARY: "cloud_vision",
    SECONDARY: "paddleocr",
    FALLBACK: "tesseract",
  },
  FACE_EMBEDDING: "insightface",
  LLM: "openai",
  COMFYUI: "comfyui",
} as const;

// Max Retry Count
export const MAX_RETRY_COUNT = 3;

// Signed URL Expiry (in minutes)
export const SIGNED_URL_EXPIRY = {
  UPLOAD: 60,
  DOWNLOAD: 60,
} as const;
