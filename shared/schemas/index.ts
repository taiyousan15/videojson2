import { z } from "zod";

// ============================================
// Common Schemas
// ============================================

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

// ============================================
// Event JSON Schema
// ============================================

export const ChapterSchema = z.object({
  id: z.string(),
  start: z.number().min(0),
  end: z.number().min(0),
  title: z.string(),
  summary: z.string().optional(),
});

export const EventSchema = z.object({
  id: z.string(),
  start: z.number().min(0),
  end: z.number().min(0),
  type: z.string(),
  description: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  entities: z.array(z.string()).optional(),
});

export const EntityTypeSchema = z.enum(["PERSON", "OBJECT", "LOCATION", "BRAND"]);

export const EntitySchema = z.object({
  id: z.string(),
  type: EntityTypeSchema,
  name: z.string(),
  embeddings: z.array(z.number()).optional(),
  linkedTo: z.string().optional(),
});

export const OnScreenTextSchema = z.object({
  id: z.string(),
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string(),
  bbox: BoundingBoxSchema,
});

export const EventJsonSchema = z.object({
  version: z.literal("1.1"),
  videoId: z.string().uuid(),
  duration: z.number().min(0),
  chapters: z.array(ChapterSchema),
  events: z.array(EventSchema),
  entities: z.array(EntitySchema).optional(),
  onScreenTexts: z.array(OnScreenTextSchema).optional(),
});

// ============================================
// Authoring JSON Schema
// ============================================

export const JsonPatchOpSchema = z.enum(["add", "remove", "replace", "copy", "move", "test"]);

export const JsonPatchOperationSchema = z.object({
  op: JsonPatchOpSchema,
  path: z.string(),
  value: z.unknown().optional(),
});

export const ScriptSegmentSchema = z.object({
  id: z.string(),
  start: z.number(),
  end: z.number(),
  narration: z.string().optional(),
  subtitle: z.string().optional(),
});

export const ScriptSchema = z.object({
  segments: z.array(ScriptSegmentSchema),
});

export const RoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  entityId: z.string().optional(),
  description: z.string().optional(),
});

export const AssetTypeSchema = z.enum(["IMAGE", "AUDIO", "VIDEO"]);

export const AssetSchema = z.object({
  id: z.string(),
  type: AssetTypeSchema,
  name: z.string().optional(),
  gcsUri: z.string(),
});

export const SubtitleStyleSchema = z.object({
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  position: z.enum(["top", "center", "bottom"]).optional(),
});

export const SafeAreaSchema = z.object({
  top: z.number().optional(),
  bottom: z.number().optional(),
  left: z.number().optional(),
  right: z.number().optional(),
});

export const StyleConfigSchema = z.object({
  subtitle: SubtitleStyleSchema.optional(),
  safeArea: SafeAreaSchema.optional(),
});

export const AuthoringJsonSchema = z.object({
  version: z.literal("1.0"),
  videoId: z.string().uuid(),
  baseEventJsonUri: z.string().optional(),
  overrides: z.array(JsonPatchOperationSchema).optional(),
  script: ScriptSchema,
  roles: z.array(RoleSchema),
  assets: z.array(AssetSchema).optional(),
  style: StyleConfigSchema.optional(),
});

// ============================================
// Plan JSON Schema
// ============================================

export const RenderModeSchema = z.enum(["REMIX", "GENERATIVE"]);
export const AspectRatioSchema = z.enum(["16:9", "9:16", "1:1"]);
export const PlatformSchema = z.enum(["YOUTUBE", "YOUTUBE_SHORTS", "TIKTOK", "INSTAGRAM"]);

export const RenderProfileSchema = z.object({
  aspectRatio: AspectRatioSchema.optional(),
  targetDuration: z.number().optional(),
  platform: PlatformSchema.optional(),
});

export const PlanSegmentSchema = z.object({
  id: z.string(),
  sourceStart: z.number(),
  sourceEnd: z.number(),
  outputStart: z.number().optional(),
  outputEnd: z.number().optional(),
  speed: z.number().default(1.0).optional(),
  reframe: BoundingBoxSchema.optional(),
  subtitle: z.string().optional(),
  comfyWorkflow: z.string().optional(),
});

export const BgmConfigSchema = z.object({
  assetId: z.string().optional(),
  gcsUri: z.string().optional(),
  volume: z.number().default(0.3).optional(),
  fadeIn: z.number().optional(),
  fadeOut: z.number().optional(),
});

export const TransitionTypeSchema = z.enum(["CUT", "FADE", "DISSOLVE", "WIPE"]);

export const TransitionSchema = z.object({
  fromSegmentId: z.string(),
  toSegmentId: z.string(),
  type: TransitionTypeSchema,
  duration: z.number().optional(),
});

export const PlanJsonSchema = z.object({
  version: z.literal("1.0"),
  videoId: z.string().uuid(),
  authoringJsonUri: z.string().optional(),
  mode: RenderModeSchema,
  profile: RenderProfileSchema.optional(),
  segments: z.array(PlanSegmentSchema),
  bgm: BgmConfigSchema.optional(),
  transitions: z.array(TransitionSchema).optional(),
});

// ============================================
// State JSON Schema
// ============================================

export const JobTypeSchema = z.enum([
  "INGEST",
  "ANALYZE",
  "OCR",
  "EMBED",
  "HIGHLIGHT",
  "RENDER",
  "ASSEMBLE",
  "TRAIN",
  "GENERATE",
  "COMFYUI",
  "FACE_SWAP",
]);

export const JobStatusSchema = z.enum([
  "PENDING",
  "QUEUED",
  "RUNNING",
  "WAITING_EXTERNAL",
  "REVIEW_REQUIRED",
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
]);

export const JobSummarySchema = z.object({
  jobId: z.string(),
  type: JobTypeSchema,
  status: JobStatusSchema,
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

export const StateArtifactsSchema = z.object({
  sourceVideo: z.string().optional(),
  normalizedVideo: z.string().optional(),
  eventJson: z.string().optional(),
  authoringJson: z.string().optional(),
  planJson: z.string().optional(),
  outputVideo: z.string().optional(),
});

export const StateJsonSchema = z.object({
  version: z.literal("1.0"),
  runId: z.string().uuid(),
  videoId: z.string().uuid(),
  createdAt: z.string().datetime(),
  config: z.record(z.unknown()).optional(),
  artifacts: StateArtifactsSchema,
  jobs: z.array(JobSummarySchema).optional(),
  providerVersions: z.record(z.string()).optional(),
  modelWeightsVersion: z.number().int().optional(),
});

// ============================================
// Inferred Types (for validation)
// ============================================

export type ValidatedEventJson = z.infer<typeof EventJsonSchema>;
export type ValidatedAuthoringJson = z.infer<typeof AuthoringJsonSchema>;
export type ValidatedPlanJson = z.infer<typeof PlanJsonSchema>;
export type ValidatedStateJson = z.infer<typeof StateJsonSchema>;
