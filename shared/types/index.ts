// Job Types
export type JobType =
  | "INGEST"
  | "ANALYZE"
  | "OCR"
  | "EMBED"
  | "HIGHLIGHT"
  | "RENDER"
  | "ASSEMBLE"
  | "TRAIN"
  | "GENERATE"
  | "COMFYUI"
  | "FACE_SWAP";

export type JobStatus =
  | "PENDING"
  | "QUEUED"
  | "RUNNING"
  | "WAITING_EXTERNAL"
  | "REVIEW_REQUIRED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED";

// Artifact Types
export type ArtifactType =
  | "SOURCE_VIDEO"
  | "NORMALIZED_VIDEO"
  | "EVENT_JSON"
  | "AUTHORING_JSON"
  | "PLAN_JSON"
  | "STATE_JSON"
  | "OUTPUT_VIDEO"
  | "THUMBNAIL"
  | "ASS_SUBTITLE"
  | "OCR_REPORT"
  | "EMBED_REPORT"
  | "HIGHLIGHT_PLAN"
  | "TEMPLATE_JSON"
  | "RENDER_SCRIPT"
  | "GENERATED_ASSETS"
  | "FACE_SWAPPED_VIDEO"
  | "TARGET_FACE"
  | "TRAINING_METRICS";

// Role Types
export type Role = "ADMIN" | "EDITOR" | "CREATOR";

// Video Types
export type SourceType = "URL" | "UPLOAD";
export type VideoStatus = "PENDING" | "INGESTING" | "READY" | "FAILED";

// Render Types
export type RenderMode = "REMIX" | "GENERATIVE";
export type AspectRatio = "16:9" | "9:16" | "1:1";
export type Platform = "YOUTUBE" | "YOUTUBE_SHORTS" | "TIKTOK" | "INSTAGRAM";

// Entity Types
export type EntityType = "PERSON" | "OBJECT" | "LOCATION" | "BRAND";

// Review Types
export type ReviewAction = "APPROVE" | "REJECT" | "PATCH";

// Event JSON
export interface EventJson {
  version: "1.1";
  videoId: string;
  duration: number;
  chapters: Chapter[];
  events: Event[];
  entities?: Entity[];
  onScreenTexts?: OnScreenText[];
}

export interface Chapter {
  id: string;
  start: number;
  end: number;
  title: string;
  summary?: string;
}

export interface Event {
  id: string;
  start: number;
  end: number;
  type: string;
  description?: string;
  confidence?: number;
  entities?: string[];
}

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  embeddings?: number[];
  linkedTo?: string;
}

export interface OnScreenText {
  id: string;
  start: number;
  end: number;
  text: string;
  bbox: BoundingBox;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Authoring JSON
export interface AuthoringJson {
  version: "1.0";
  videoId: string;
  baseEventJsonUri?: string;
  overrides?: JsonPatchOperation[];
  script: Script;
  roles: RoleDefinition[];
  assets?: Asset[];
  style?: StyleConfig;
}

export interface JsonPatchOperation {
  op: "add" | "remove" | "replace" | "copy" | "move" | "test";
  path: string;
  value?: unknown;
}

export interface Script {
  segments: ScriptSegment[];
}

export interface ScriptSegment {
  id: string;
  start: number;
  end: number;
  narration?: string;
  subtitle?: string;
}

export interface RoleDefinition {
  id: string;
  name: string;
  entityId?: string;
  description?: string;
}

export interface Asset {
  id: string;
  type: "IMAGE" | "AUDIO" | "VIDEO";
  name?: string;
  gcsUri: string;
}

export interface StyleConfig {
  subtitle?: SubtitleStyle;
  safeArea?: SafeArea;
}

export interface SubtitleStyle {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  position?: "top" | "center" | "bottom";
}

export interface SafeArea {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

// Plan JSON
export interface PlanJson {
  version: "1.0";
  videoId: string;
  authoringJsonUri?: string;
  mode: RenderMode;
  profile?: RenderProfile;
  segments: PlanSegment[];
  bgm?: BgmConfig;
  transitions?: Transition[];
}

export interface RenderProfile {
  aspectRatio?: AspectRatio;
  targetDuration?: number;
  platform?: Platform;
}

export interface PlanSegment {
  id: string;
  sourceStart: number;
  sourceEnd: number;
  outputStart?: number;
  outputEnd?: number;
  speed?: number;
  reframe?: BoundingBox;
  subtitle?: string;
  comfyWorkflow?: string;
}

export interface BgmConfig {
  assetId?: string;
  gcsUri?: string;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
}

export interface Transition {
  fromSegmentId: string;
  toSegmentId: string;
  type: "CUT" | "FADE" | "DISSOLVE" | "WIPE";
  duration?: number;
}

// State JSON
export interface StateJson {
  version: "1.0";
  runId: string;
  videoId: string;
  createdAt: string;
  config?: Record<string, unknown>;
  artifacts: StateArtifacts;
  jobs?: JobSummary[];
  providerVersions?: Record<string, string>;
  modelWeightsVersion?: number;
}

export interface StateArtifacts {
  sourceVideo?: string;
  normalizedVideo?: string;
  eventJson?: string;
  authoringJson?: string;
  planJson?: string;
  outputVideo?: string;
}

export interface JobSummary {
  jobId: string;
  type: JobType;
  status: JobStatus;
  startedAt?: string;
  completedAt?: string;
}
