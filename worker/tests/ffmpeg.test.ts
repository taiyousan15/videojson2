import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs/promises";

// Mock child_process
vi.mock("child_process", () => ({
  spawn: vi.fn(() => {
    const mockProcess = {
      stderr: {
        on: vi.fn((event, callback) => {
          if (event === "data") {
            // Simulate ffmpeg progress output
            callback(Buffer.from("frame=100"));
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === "close") {
          // Simulate successful completion
          setTimeout(() => callback(0), 10);
        }
      }),
    };
    return mockProcess;
  }),
}));

// Mock fs for concat
vi.mock("fs/promises", async () => {
  const actual = await vi.importActual<typeof fs>("fs/promises");
  return {
    ...actual,
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  };
});

describe("FFmpeg concat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle single file input by copying", async () => {
    const { concat } = await import("../src/ffmpeg/concat");
    const result = await concat(["/tmp/video1.mp4"]);

    expect(fs.copyFile).toHaveBeenCalledWith("/tmp/video1.mp4", expect.any(String));
  });

  it("should create concat list file for multiple inputs", async () => {
    const { concat } = await import("../src/ffmpeg/concat");
    const result = await concat(["/tmp/video1.mp4", "/tmp/video2.mp4"]);

    expect(fs.writeFile).toHaveBeenCalled();
    const writeCall = (fs.writeFile as any).mock.calls[0];
    expect(writeCall[1]).toContain("file '/tmp/video1.mp4'");
    expect(writeCall[1]).toContain("file '/tmp/video2.mp4'");
  });

  it("should throw error for empty input", async () => {
    const { concat } = await import("../src/ffmpeg/concat");

    await expect(concat([])).rejects.toThrow("No input files provided");
  });
});

describe("FFmpeg cut", () => {
  it("should generate correct output path", async () => {
    const { cut } = await import("../src/ffmpeg/cut");
    const result = await cut("/tmp/input.mp4", 10, 20);

    expect(result).toMatch(/^\/tmp\/clip_\d+_10_20\.mp4$/);
  });
});

describe("FFmpeg burnSubtitles", () => {
  it("should generate subtitled output path", async () => {
    const { burnSubtitles } = await import("../src/ffmpeg/burnSubtitles");
    const result = await burnSubtitles("/tmp/video.mp4", "/tmp/subs.ass");

    expect(result).toBe("/tmp/video_subtitled.mp4");
  });
});

describe("FFmpeg mixAudio", () => {
  it("should generate bgm output path", async () => {
    const { mixAudio } = await import("../src/ffmpeg/mixAudio");
    const result = await mixAudio("/tmp/video.mp4", "/tmp/bgm.mp3", 0.3);

    expect(result).toBe("/tmp/video_bgm.mp4");
  });
});
