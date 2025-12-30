/**
 * Provider Types - 全AIプロバイダーの共通型定義
 */

// ===========================================
// Video Analysis Types
// ===========================================

export interface VideoSegment {
  id: string;
  startTime: number; // seconds
  endTime: number;
  duration: number;
  type: "scene" | "chapter" | "highlight" | "transition";
}

export interface SceneInfo extends VideoSegment {
  description: string;
  tags: string[];
  sentiment?: "positive" | "negative" | "neutral";
  intensity?: number; // 0-1
  thumbnail?: string; // GCS URI or base64
}

export interface DetectedEntity {
  id: string;
  name: string;
  type: "person" | "object" | "location" | "brand" | "text" | "action";
  confidence: number; // 0-1
  appearances: Array<{
    startTime: number;
    endTime: number;
    boundingBox?: BoundingBox;
  }>;
  attributes?: Record<string, string>;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  speaker?: string;
  confidence: number;
  language?: string;
}

export interface OnScreenText {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  boundingBox: BoundingBox;
  confidence: number;
  type: "title" | "subtitle" | "caption" | "watermark" | "other";
}

export interface VideoEvent {
  id: string;
  type: string;
  startTime: number;
  endTime: number;
  description: string;
  participants?: string[];
  metadata?: Record<string, unknown>;
}

// ===========================================
// Analysis Result Types
// ===========================================

export interface VideoAnalysisResult {
  videoId: string;
  duration: number;
  resolution: { width: number; height: number };
  fps: number;

  // Structural analysis
  scenes: SceneInfo[];
  chapters: VideoSegment[];

  // Content analysis
  entities: DetectedEntity[];
  events: VideoEvent[];
  transcript: TranscriptSegment[];
  onScreenTexts: OnScreenText[];

  // Metadata
  summary: string;
  tags: string[];
  language: string;

  // Raw provider responses for debugging
  _raw?: Record<string, unknown>;
}

// ===========================================
// Template Types
// ===========================================

export interface VideoTemplate {
  id: string;
  name: string;
  sourceVideoId: string;
  version: string;
  createdAt: string;

  // Structure
  structure: TemplateStructure;

  // Replaceable elements
  placeholders: TemplatePlaceholder[];

  // Style guide
  style: TemplateStyle;

  // Timing information
  timing: TemplateTiming;
}

export interface TemplateStructure {
  totalDuration: number;
  sections: TemplateSection[];
}

export interface TemplateSection {
  id: string;
  name: string;
  type: "intro" | "content" | "transition" | "outro" | "custom";
  startTime: number;
  endTime: number;
  isReplaceable: boolean;
  description: string;
}

export interface TemplatePlaceholder {
  id: string;
  type: "text" | "image" | "video" | "audio" | "narration";
  name: string;
  description: string;
  startTime: number;
  endTime: number;
  position?: BoundingBox;
  defaultValue?: string;
  constraints?: PlaceholderConstraints;
}

export interface PlaceholderConstraints {
  maxLength?: number;
  minLength?: number;
  format?: string;
  aspectRatio?: string;
  duration?: { min: number; max: number };
}

export interface TemplateStyle {
  fonts: Array<{
    name: string;
    usage: string;
    size?: number;
    color?: string;
  }>;
  colors: Array<{
    name: string;
    hex: string;
    usage: string;
  }>;
  transitions: Array<{
    type: string;
    duration: number;
    timing: number;
  }>;
  effects: string[];
}

export interface TemplateTiming {
  bpm?: number;
  beats?: Array<{ time: number; type: string }>;
  cuePoints: Array<{
    time: number;
    type: string;
    description: string;
  }>;
}

// ===========================================
// LLM Types
// ===========================================

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | LLMContentPart[];
}

export interface LLMContentPart {
  type: "text" | "image" | "video";
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  base64?: string;
  mimeType?: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
  finishReason: string;
}

export interface StructuredOutput<T> {
  data: T;
  raw: string;
  confidence?: number;
}

// ===========================================
// TTS Types
// ===========================================

export interface TTSRequest {
  text: string;
  voice?: string;
  language?: string;
  speed?: number;
  pitch?: number;
  stability?: number;
  similarityBoost?: number;
  style?: number;
}

export interface TTSResult {
  audioUrl: string;
  duration: number;
  format: string;
}

// ===========================================
// Video Generation Types
// ===========================================

export interface VideoGenerationRequest {
  prompt: string;
  duration?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  style?: string;
  referenceImage?: string;
  referenceVideo?: string;
}

export interface VideoGenerationResult {
  videoUrl: string;
  duration: number;
  taskId: string;
  status: "pending" | "processing" | "completed" | "failed";
}

// ===========================================
// Image Generation Types
// ===========================================

export interface ImageGenerationRequest {
  prompt: string;
  width?: number;
  height?: number;
  style?: string;
  negativePrompt?: string;
  referenceImage?: string;
}

export interface ImageGenerationResult {
  imageUrl: string;
  width: number;
  height: number;
}

// ===========================================
// Provider Interface
// ===========================================

export interface AIProvider {
  name: string;
  isAvailable(): Promise<boolean>;
}

export interface VideoAnalysisProvider extends AIProvider {
  analyzeVideo(videoUrl: string, options?: VideoAnalysisOptions): Promise<VideoAnalysisResult>;
}

export interface VideoAnalysisOptions {
  extractScenes?: boolean;
  extractEntities?: boolean;
  extractTranscript?: boolean;
  extractOCR?: boolean;
  language?: string;
}

export interface LLMProvider extends AIProvider {
  chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
  chatStructured<T>(messages: LLMMessage[], schema: object, options?: LLMOptions): Promise<StructuredOutput<T>>;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
}

export interface TTSProvider extends AIProvider {
  synthesize(request: TTSRequest): Promise<TTSResult>;
  listVoices(): Promise<Array<{ id: string; name: string; language: string }>>;
}

export interface VideoGenerationProvider extends AIProvider {
  generate(request: VideoGenerationRequest): Promise<VideoGenerationResult>;
  getStatus(taskId: string): Promise<VideoGenerationResult>;
}

export interface ImageGenerationProvider extends AIProvider {
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

export interface STTProvider extends AIProvider {
  transcribe(audioUrl: string, options?: STTOptions): Promise<TranscriptSegment[]>;
}

export interface STTOptions {
  language?: string;
  timestamps?: boolean;
  speakerDiarization?: boolean;
}
