import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  domain: z.string().optional(),
  language: z.string().default("ja"),
});

export const createVideoSchema = z.object({
  sourceType: z.enum(["URL", "UPLOAD"]),
  sourceUrl: z.string().url().optional(),
  filename: z.string().optional(),
});

export const createJobSchema = z.object({
  videoId: z.string().uuid(),
  config: z.record(z.unknown()).optional(),
});

export const reviewPatchSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "PATCH"]),
  patch: z.array(z.object({
    op: z.enum(["add", "remove", "replace", "copy", "move", "test"]),
    path: z.string(),
    value: z.unknown().optional(),
  })).optional(),
  comment: z.string().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateVideoInput = z.infer<typeof createVideoSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type ReviewPatchInput = z.infer<typeof reviewPatchSchema>;
