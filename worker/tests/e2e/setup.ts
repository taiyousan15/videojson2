/**
 * E2E Test Setup
 *
 * Provides test utilities for end-to-end API testing
 */

import { vi } from "vitest";
import express, { Express } from "express";

// Mock external services
export const mockPrisma = {
  $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  $disconnect: vi.fn().mockResolvedValue(undefined),
  job: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  video: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  artifact: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  webhook: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  webhookDelivery: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  project: {
    findUnique: vi.fn(),
  },
  highlightFeedback: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  modelWeights: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

export const mockGcs = {
  downloadFile: vi.fn().mockResolvedValue(undefined),
  uploadFile: vi.fn().mockResolvedValue(undefined),
  uploadJSON: vi.fn().mockResolvedValue(undefined),
  downloadJSON: vi.fn().mockResolvedValue({}),
  getDefaultBucket: vi.fn().mockReturnValue("test-bucket"),
  buildGcsUri: vi.fn((bucket: string, path: string) => `gs://${bucket}/${path}`),
  parseGcsUri: vi.fn((uri: string) => {
    const match = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    return match ? { bucket: match[1], path: match[2] } : null;
  }),
};

export const mockFetch = vi.fn();

// Setup mocks before importing app
export function setupMocks(): void {
  vi.mock("../../src/db", () => ({
    prisma: mockPrisma,
  }));

  vi.mock("../../src/utils/gcs", () => mockGcs);

  // Mock fetch for webhook and external calls
  global.fetch = mockFetch;

  // Set test environment variables
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.GCS_BUCKET = "test-bucket";
  process.env.NODE_ENV = "test";
  process.env.PORT = "0"; // Random port
}

// Reset all mocks
export function resetMocks(): void {
  vi.clearAllMocks();
  mockFetch.mockReset();
}

// Sample test data factories
export const testData = {
  createProject: (overrides = {}) => ({
    id: "proj_test123",
    name: "Test Project",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  createVideo: (overrides = {}) => ({
    id: "video_test123",
    projectId: "proj_test123",
    title: "Test Video",
    sourceUrl: "https://example.com/video.mp4",
    status: "PENDING",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  createJob: (overrides = {}) => ({
    id: "job_test123",
    videoId: "video_test123",
    type: "INGEST",
    status: "QUEUED",
    progress: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    video: {
      id: "video_test123",
      projectId: "proj_test123",
    },
    ...overrides,
  }),

  createArtifact: (overrides = {}) => ({
    id: "artifact_test123",
    jobId: "job_test123",
    videoId: "video_test123",
    type: "NORMALIZED_VIDEO",
    gcsUri: "gs://test-bucket/videos/video_test123/normalized.mp4",
    createdAt: new Date(),
    ...overrides,
  }),

  createWebhook: (overrides = {}) => ({
    id: "webhook_test123",
    projectId: "proj_test123",
    name: "Test Webhook",
    url: "https://example.com/webhook",
    secret: "test-secret",
    events: ["job.completed", "job.failed"],
    headers: {},
    active: true,
    retryCount: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  createTemplate: () => ({
    version: "1.0",
    name: "Test Template",
    structure: {
      sections: [
        { id: "s1", start: 0, end: 30, type: "intro" },
        { id: "s2", start: 30, end: 90, type: "content" },
      ],
      totalDuration: 90,
    },
    placeholders: [
      { id: "p1", type: "text", path: "/sections/0/title", defaultValue: "Hello" },
      { id: "p2", type: "image", path: "/sections/1/background" },
    ],
    styles: {
      font: "Arial",
      primaryColor: "#000000",
    },
  }),

  createEventJson: () => ({
    duration: 120,
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    summary: "Test video analysis",
    language: "en",
    scenes: [
      { id: "scene1", start: 0, end: 30, description: "Introduction" },
      { id: "scene2", start: 30, end: 90, description: "Main content" },
    ],
    entities: [
      { id: "e1", type: "PERSON", name: "Speaker", confidence: 0.95 },
    ],
    transcript: [
      { start: 0, end: 5, text: "Hello everyone", confidence: 0.9 },
    ],
  }),

  createRenderScript: () => ({
    version: "1.0",
    duration: 30,
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
      {
        type: "video",
        segments: [
          { start: 0, end: 30, source: "gs://bucket/clip1.mp4" },
        ],
      },
      {
        type: "audio",
        segments: [
          { start: 0, end: 30, source: "gs://bucket/audio.mp3" },
        ],
      },
    ],
    overlays: [],
  }),
};

// Helper to wait for async operations
export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper to create a mock response for fetch
export function mockFetchResponse(data: any, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers(),
    redirected: false,
    type: "basic",
    url: "",
    clone: () => mockFetchResponse(data, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
  } as Response;
}
