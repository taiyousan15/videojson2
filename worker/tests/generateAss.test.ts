import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs/promises";

// Mock fs
vi.mock("fs/promises", async () => {
  const actual = await vi.importActual<typeof fs>("fs/promises");
  return {
    ...actual,
    writeFile: vi.fn(),
  };
});

describe("ASS Generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateAss", () => {
    it("should generate valid ASS header", async () => {
      const { generateAss } = await import("../src/ffmpeg/generateAss");

      const entries = [
        { startTime: 0, endTime: 3, text: "Hello World" },
      ];

      await generateAss(entries, "/tmp/test.ass");

      expect(fs.writeFile).toHaveBeenCalled();
      const content = (fs.writeFile as any).mock.calls[0][1];

      expect(content).toContain("[Script Info]");
      expect(content).toContain("ScriptType: v4.00+");
      expect(content).toContain("PlayResX: 1920");
      expect(content).toContain("PlayResY: 1080");
    });

    it("should include style definitions", async () => {
      const { generateAss } = await import("../src/ffmpeg/generateAss");

      const entries = [
        { startTime: 0, endTime: 3, text: "Test" },
      ];

      await generateAss(entries, "/tmp/test.ass");

      const content = (fs.writeFile as any).mock.calls[0][1];

      expect(content).toContain("[V4+ Styles]");
      expect(content).toContain("Style: Default");
      expect(content).toContain("Noto Sans JP");
    });

    it("should generate dialogue events", async () => {
      const { generateAss } = await import("../src/ffmpeg/generateAss");

      const entries = [
        { startTime: 1.5, endTime: 4.25, text: "First subtitle" },
        { startTime: 5, endTime: 8, text: "Second subtitle" },
      ];

      await generateAss(entries, "/tmp/test.ass");

      const content = (fs.writeFile as any).mock.calls[0][1];

      expect(content).toContain("[Events]");
      expect(content).toContain("Dialogue: 0,0:00:01.50,0:00:04.25,Default");
      expect(content).toContain("First subtitle");
      expect(content).toContain("Dialogue: 0,0:00:05.00,0:00:08.00,Default");
      expect(content).toContain("Second subtitle");
    });

    it("should handle position overrides", async () => {
      const { generateAss } = await import("../src/ffmpeg/generateAss");

      const entries = [
        { startTime: 0, endTime: 3, text: "Top text", position: "top" as const },
        { startTime: 3, endTime: 6, text: "Center text", position: "center" as const },
      ];

      await generateAss(entries, "/tmp/test.ass");

      const content = (fs.writeFile as any).mock.calls[0][1];

      expect(content).toContain("{\\an8}Top text");
      expect(content).toContain("{\\an5}Center text");
    });

    it("should handle fade effects", async () => {
      const { generateAss } = await import("../src/ffmpeg/generateAss");

      const entries = [
        { startTime: 0, endTime: 3, text: "Fade text", effect: "fade" as const },
      ];

      await generateAss(entries, "/tmp/test.ass");

      const content = (fs.writeFile as any).mock.calls[0][1];

      expect(content).toContain("{\\fad(200,200)}Fade text");
    });

    it("should escape special characters", async () => {
      const { generateAss } = await import("../src/ffmpeg/generateAss");

      const entries = [
        { startTime: 0, endTime: 3, text: "Line 1\nLine 2" },
        { startTime: 3, endTime: 6, text: "Braces {test}" },
      ];

      await generateAss(entries, "/tmp/test.ass");

      const content = (fs.writeFile as any).mock.calls[0][1];

      expect(content).toContain("Line 1\\NLine 2");
      expect(content).toContain("Braces \\{test\\}");
    });
  });

  describe("generateAssFromAuthoring", () => {
    it("should extract subtitles from segments", async () => {
      const { generateAssFromAuthoring } = await import("../src/ffmpeg/generateAss");

      const authoring = {
        segments: [
          { startTime: 0, endTime: 5, subtitle: "First segment" },
          { startTime: 5, endTime: 10, caption: "Second segment" },
        ],
      };

      await generateAssFromAuthoring(authoring, "/tmp/test.ass");

      const content = (fs.writeFile as any).mock.calls[0][1];

      expect(content).toContain("First segment");
      expect(content).toContain("Second segment");
    });

    it("should handle nested overlays", async () => {
      const { generateAssFromAuthoring } = await import("../src/ffmpeg/generateAss");

      const authoring = {
        segments: [
          {
            startTime: 0,
            endTime: 10,
            overlays: [
              { type: "text", text: "Overlay text", startTime: 2, endTime: 5 },
            ],
          },
        ],
      };

      await generateAssFromAuthoring(authoring, "/tmp/test.ass");

      const content = (fs.writeFile as any).mock.calls[0][1];

      expect(content).toContain("Overlay text");
    });

    it("should handle global captions", async () => {
      const { generateAssFromAuthoring } = await import("../src/ffmpeg/generateAss");

      const authoring = {
        captions: [
          { startTime: 0, endTime: 3, text: "Global caption" },
        ],
      };

      await generateAssFromAuthoring(authoring, "/tmp/test.ass");

      const content = (fs.writeFile as any).mock.calls[0][1];

      expect(content).toContain("Global caption");
    });

    it("should handle empty authoring JSON", async () => {
      const { generateAssFromAuthoring } = await import("../src/ffmpeg/generateAss");

      await generateAssFromAuthoring({}, "/tmp/test.ass");

      expect(fs.writeFile).toHaveBeenCalled();
      const content = (fs.writeFile as any).mock.calls[0][1];

      // Should still have valid structure
      expect(content).toContain("[Script Info]");
      expect(content).toContain("[Events]");
    });
  });

  describe("generateAssFromTranscript", () => {
    it("should convert transcript to ASS", async () => {
      const { generateAssFromTranscript } = await import("../src/ffmpeg/generateAss");

      const transcript = [
        { start: 0, end: 2, text: "Hello" },
        { start: 2, end: 4, text: "World" },
      ];

      await generateAssFromTranscript(transcript, "/tmp/test.ass");

      const content = (fs.writeFile as any).mock.calls[0][1];

      expect(content).toContain("Hello");
      expect(content).toContain("World");
    });
  });
});
