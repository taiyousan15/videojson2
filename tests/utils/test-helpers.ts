import { vi } from "vitest";

// Mock Prisma client
export function createMockPrismaClient() {
  return {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    video: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    job: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    output: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    artifact: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    highlightFeedback: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    workspaceMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    modelWeights: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn()),
  };
}

// Mock session
export function createMockSession(overrides = {}) {
  return {
    user: {
      id: "test-user-id",
      email: "test@example.com",
      name: "Test User",
      role: "EDITOR",
      ...overrides,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

// Mock NextRequest - creates a properly typed NextRequest for testing
export function createMockNextRequest(options: {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
} = {}) {
  const { method = "GET", url = "http://localhost:3000", body, headers = {} } = options;

  const init: RequestInit = {
    method,
    headers: new Headers(headers),
  };

  if (body && method !== "GET") {
    init.body = JSON.stringify(body);
    (init.headers as Headers).set("Content-Type", "application/json");
  }

  // NextRequest extends Request - use type assertion for tests
  const request = new Request(url, init);
  return request as unknown as import("next/server").NextRequest;
}

// Legacy alias for backwards compatibility
export const createMockRequest = createMockNextRequest;

// Test data factories
export const testData = {
  user: (overrides = {}) => ({
    id: "user-1",
    email: "user@example.com",
    name: "Test User",
    role: "EDITOR",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  project: (overrides = {}) => ({
    id: "project-1",
    name: "Test Project",
    workspaceId: "workspace-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  video: (overrides = {}) => ({
    id: "video-1",
    projectId: "project-1",
    sourceType: "URL",
    sourceUrl: "https://example.com/video.mp4",
    status: "READY",
    duration: 120,
    width: 1920,
    height: 1080,
    fps: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  job: (overrides = {}) => ({
    id: "job-1",
    videoId: "video-1",
    type: "ANALYZE",
    status: "PENDING",
    progress: 0,
    config: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  output: (overrides = {}) => ({
    id: "output-1",
    videoId: "video-1",
    runId: "run-1",
    name: "output.mp4",
    gcsUri: "gs://bucket/output.mp4",
    format: "mp4",
    duration: 60,
    aspectRatio: "16:9",
    createdAt: new Date(),
    ...overrides,
  }),

  feedback: (overrides = {}) => ({
    id: "feedback-1",
    videoId: "video-1",
    segmentId: "segment-1",
    rating: 4,
    comment: "Good highlight",
    createdById: "user-1",
    createdAt: new Date(),
    ...overrides,
  }),
};
