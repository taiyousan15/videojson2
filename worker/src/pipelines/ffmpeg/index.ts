/**
 * FFmpeg Pipeline - 動画レンダリング
 */

import { spawn } from "child_process";
import { Storage } from "@google-cloud/storage";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const storage = new Storage();

export interface RenderScript {
  version: string;
  duration: number;
  resolution: { width: number; height: number };
  fps: number;
  tracks: RenderTrack[];
}

export interface RenderTrack {
  type: "video" | "audio" | "text";
  clips: RenderClip[];
}

export interface RenderClip {
  id: string;
  startTime: number;
  endTime: number;
  source: string;
  effects?: string[];
  transitions?: {
    in?: { type: string; duration: number };
    out?: { type: string; duration: number };
  };
}

export interface RenderOptions {
  outputFormat?: "mp4" | "webm" | "mov";
  quality?: "draft" | "standard" | "high" | "ultra";
  codec?: "h264" | "h265" | "vp9";
  audioBitrate?: string;
  preset?: "ultrafast" | "fast" | "medium" | "slow" | "veryslow";
}

export interface RenderProgress {
  percent: number;
  frame: number;
  fps: number;
  time: string;
  speed: string;
}

export interface RenderResult {
  success: boolean;
  outputPath: string;
  duration: number;
  fileSize: number;
  format: string;
  resolution: { width: number; height: number };
  error?: string;
}

const QualityPresets = {
  draft: { preset: "ultrafast" as const, crf: 28, audioBitrate: "128k" },
  standard: { preset: "medium" as const, crf: 23, audioBitrate: "192k" },
  high: { preset: "slow" as const, crf: 18, audioBitrate: "256k" },
  ultra: { preset: "veryslow" as const, crf: 15, audioBitrate: "320k" },
};

export class FFmpegCommandGenerator {
  generateCommand(script: RenderScript, outputPath: string, options: RenderOptions = {}): string[] {
    const args: string[] = ["-y"];
    const quality = QualityPresets[options.quality || "standard"];

    const videoTrack = script.tracks.find((t) => t.type === "video");
    const audioTrack = script.tracks.find((t) => t.type === "audio");

    const videoInputs: string[] = [];
    if (videoTrack) {
      for (const clip of videoTrack.clips) {
        args.push("-i", clip.source);
        videoInputs.push(clip.source);
      }
    }

    const audioInputs: string[] = [];
    if (audioTrack) {
      for (const clip of audioTrack.clips) {
        args.push("-i", clip.source);
        audioInputs.push(clip.source);
      }
    }

    const filterComplex = this.buildFilterComplex(script, videoInputs.length, audioInputs.length);

    if (filterComplex) {
      args.push("-filter_complex", filterComplex);
      args.push("-map", "[vout]");
      if (audioInputs.length > 0) {
        args.push("-map", "[aout]");
      }
    }

    const codec = options.codec || "h264";
    if (codec === "h264") {
      args.push("-c:v", "libx264", "-crf", quality.crf.toString(), "-preset", options.preset || quality.preset, "-pix_fmt", "yuv420p");
    } else if (codec === "h265") {
      args.push("-c:v", "libx265", "-crf", quality.crf.toString(), "-preset", options.preset || quality.preset);
    } else if (codec === "vp9") {
      args.push("-c:v", "libvpx-vp9", "-crf", quality.crf.toString(), "-b:v", "0");
    }

    if (audioInputs.length > 0) {
      args.push("-c:a", "aac", "-b:a", options.audioBitrate || quality.audioBitrate);
    }

    args.push("-r", script.fps.toString());
    args.push("-s", script.resolution.width + "x" + script.resolution.height);

    if ((options.outputFormat || "mp4") === "mp4") {
      args.push("-movflags", "+faststart");
    }

    args.push(outputPath);
    return args;
  }

  private buildFilterComplex(script: RenderScript, videoCount: number, audioCount: number): string {
    const filters: string[] = [];
    const videoTrack = script.tracks.find((t) => t.type === "video");
    const audioTrack = script.tracks.find((t) => t.type === "audio");

    if (!videoTrack || videoTrack.clips.length === 0) return "";

    const videoLabels: string[] = [];
    for (let i = 0; i < videoTrack.clips.length; i++) {
      const clip = videoTrack.clips[i];
      const inputLabel = "[" + i + ":v]";
      const outputLabel = "[v" + i + "]";
      const clipFilters: string[] = [];

      clipFilters.push("scale=" + script.resolution.width + ":" + script.resolution.height + ":force_original_aspect_ratio=decrease");
      clipFilters.push("pad=" + script.resolution.width + ":" + script.resolution.height + ":(ow-iw)/2:(oh-ih)/2");
      clipFilters.push("fps=" + script.fps);

      if (clip.transitions?.in && i > 0) {
        clipFilters.push("fade=t=in:st=0:d=" + clip.transitions.in.duration);
      }
      if (clip.transitions?.out) {
        const clipDur = clip.endTime - clip.startTime;
        const fadeDur = clip.transitions.out.duration;
        clipFilters.push("fade=t=out:st=" + (clipDur - fadeDur) + ":d=" + fadeDur);
      }

      if (clip.effects) {
        for (const effect of clip.effects) {
          const ef = this.getEffectFilter(effect);
          if (ef) clipFilters.push(ef);
        }
      }

      const duration = clip.endTime - clip.startTime;
      clipFilters.push("trim=duration=" + duration);
      clipFilters.push("setpts=PTS-STARTPTS");

      filters.push(inputLabel + clipFilters.join(",") + outputLabel);
      videoLabels.push(outputLabel);
    }

    if (videoLabels.length > 1) {
      filters.push(videoLabels.join("") + "concat=n=" + videoLabels.length + ":v=1:a=0[vout]");
    } else if (videoLabels.length === 1) {
      filters.push(videoLabels[0] + "copy[vout]");
    }

    if (audioTrack && audioTrack.clips.length > 0) {
      const audioLabels: string[] = [];
      const audioStartIndex = videoCount;
      for (let i = 0; i < audioTrack.clips.length; i++) {
        const clip = audioTrack.clips[i];
        const inputLabel = "[" + (audioStartIndex + i) + ":a]";
        const outputLabel = "[a" + i + "]";
        const duration = clip.endTime - clip.startTime;
        filters.push(inputLabel + "atrim=duration=" + duration + ",asetpts=PTS-STARTPTS" + outputLabel);
        audioLabels.push(outputLabel);
      }
      if (audioLabels.length > 1) {
        filters.push(audioLabels.join("") + "concat=n=" + audioLabels.length + ":v=0:a=1[aout]");
      } else if (audioLabels.length === 1) {
        filters.push(audioLabels[0] + "acopy[aout]");
      }
    }

    return filters.join(";");
  }

  private getEffectFilter(effect: string): string | null {
    const effectMap: Record<string, string> = {
      grayscale: "colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3",
      sepia: "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
      invert: "negate",
      blur: "boxblur=2:1",
      sharpen: "unsharp=5:5:1.0:5:5:0.0",
    };
    return effectMap[effect] || null;
  }

  generateThumbnailCommand(videoPath: string, outputPath: string, timestamp: number = 0): string[] {
    return ["-ss", timestamp.toString(), "-i", videoPath, "-vframes", "1", "-vf", "scale=640:360:force_original_aspect_ratio=decrease", "-q:v", "2", outputPath];
  }
}

export class FFmpegRenderer {
  private generator: FFmpegCommandGenerator;
  private ffmpegPath: string;
  private tempDir: string;

  constructor(ffmpegPath: string = "ffmpeg") {
    this.generator = new FFmpegCommandGenerator();
    this.ffmpegPath = ffmpegPath;
    this.tempDir = path.join(os.tmpdir(), "videojson-render");
  }

  async render(script: RenderScript, outputPath: string, options: RenderOptions = {}, onProgress?: (progress: RenderProgress) => void): Promise<RenderResult> {
    const startTime = Date.now();
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });

    const localScript = await this.prepareAssets(script);
    const args = this.generator.generateCommand(localScript, outputPath, options);

    console.log("[FFmpeg] Executing: " + this.ffmpegPath + " " + args.join(" "));

    return new Promise((resolve, reject) => {
      const proc = spawn(this.ffmpegPath, args);
      let stderr = "";

      proc.stderr.on("data", (data) => {
        const line = data.toString();
        stderr += line;
        if (onProgress) {
          const progress = this.parseProgress(line, script.duration);
          if (progress) onProgress(progress);
        }
      });

      proc.on("close", (code) => {
        this.cleanupAssets(localScript);
        if (code === 0) {
          const stats = fs.statSync(outputPath);
          resolve({ success: true, outputPath, duration: (Date.now() - startTime) / 1000, fileSize: stats.size, format: options.outputFormat || "mp4", resolution: script.resolution });
        } else {
          reject(new Error("FFmpeg failed with code " + code + ": " + stderr));
        }
      });

      proc.on("error", (err) => { this.cleanupAssets(localScript); reject(err); });
    });
  }

  async renderToGCS(script: RenderScript, bucket: string, gcsPath: string, options: RenderOptions = {}, onProgress?: (progress: RenderProgress) => void): Promise<RenderResult> {
    const tempOutput = path.join(this.tempDir, "output-" + Date.now() + "." + (options.outputFormat || "mp4"));
    try {
      const result = await this.render(script, tempOutput, options, onProgress);
      console.log("[FFmpeg] Uploading to gs://" + bucket + "/" + gcsPath);
      await storage.bucket(bucket).upload(tempOutput, { destination: gcsPath, metadata: { contentType: "video/" + (options.outputFormat || "mp4") } });
      fs.unlinkSync(tempOutput);
      return { ...result, outputPath: "gs://" + bucket + "/" + gcsPath };
    } catch (error) {
      if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
      throw error;
    }
  }

  private async prepareAssets(script: RenderScript): Promise<RenderScript> {
    const localScript = JSON.parse(JSON.stringify(script)) as RenderScript;
    for (const track of localScript.tracks) {
      for (const clip of track.clips) {
        if (clip.source.startsWith("gs://")) {
          clip.source = await this.downloadFromGCS(clip.source);
        } else if (clip.source.startsWith("http://") || clip.source.startsWith("https://")) {
          clip.source = await this.downloadFromURL(clip.source);
        }
      }
    }
    return localScript;
  }

  private async downloadFromGCS(gcsUri: string): Promise<string> {
    const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) throw new Error("Invalid GCS URI: " + gcsUri);
    const [, bucket, filePath] = match;
    const ext = path.extname(filePath) || ".mp4";
    const localPath = path.join(this.tempDir, "asset-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ext);
    await storage.bucket(bucket).file(filePath).download({ destination: localPath });
    return localPath;
  }

  private async downloadFromURL(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to download: " + url);
    const ext = path.extname(new URL(url).pathname) || ".mp4";
    const localPath = path.join(this.tempDir, "asset-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ext);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    return localPath;
  }

  private cleanupAssets(script: RenderScript): void {
    for (const track of script.tracks) {
      for (const clip of track.clips) {
        if (clip.source.startsWith(this.tempDir) && fs.existsSync(clip.source)) {
          try { fs.unlinkSync(clip.source); } catch { }
        }
      }
    }
  }

  private parseProgress(line: string, totalDuration: number): RenderProgress | null {
    const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2}.\d{2})/);
    if (!timeMatch) return null;
    const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
    const frameMatch = line.match(/frame=\s*(\d+)/);
    const fpsMatch = line.match(/fps=\s*([\d.]+)/);
    const speedMatch = line.match(/speed=\s*([\d.]+)x/);
    return {
      percent: Math.min(100, (currentTime / totalDuration) * 100),
      frame: frameMatch ? parseInt(frameMatch[1]) : 0,
      fps: fpsMatch ? parseFloat(fpsMatch[1]) : 0,
      time: timeMatch[1] + ":" + timeMatch[2] + ":" + timeMatch[3],
      speed: speedMatch ? speedMatch[1] + "x" : "0x",
    };
  }

  async generateThumbnail(videoPath: string, outputPath: string, timestamp: number = 0): Promise<void> {
    const args = this.generator.generateThumbnailCommand(videoPath, outputPath, timestamp);
    return new Promise((resolve, reject) => {
      const proc = spawn(this.ffmpegPath, ["-y", ...args]);
      proc.on("close", (code) => { if (code === 0) resolve(); else reject(new Error("Thumbnail failed")); });
      proc.on("error", reject);
    });
  }

  async getVideoInfo(videoPath: string): Promise<{ duration: number; width: number; height: number; fps: number; codec: string; bitrate: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", videoPath]);
      let stdout = "";
      proc.stdout.on("data", (data) => { stdout += data.toString(); });
      proc.on("close", (code) => {
        if (code !== 0) { reject(new Error("ffprobe failed")); return; }
        try {
          const info = JSON.parse(stdout);
          const vs = info.streams.find((s: any) => s.codec_type === "video");
          resolve({ duration: parseFloat(info.format.duration), width: vs?.width || 0, height: vs?.height || 0, fps: vs?.r_frame_rate ? eval(vs.r_frame_rate) : 0, codec: vs?.codec_name || "", bitrate: parseInt(info.format.bit_rate) || 0 });
        } catch (e) { reject(e); }
      });
      proc.on("error", reject);
    });
  }
}

let rendererInstance: FFmpegRenderer | null = null;
export function getFFmpegRenderer(): FFmpegRenderer { if (!rendererInstance) rendererInstance = new FFmpegRenderer(); return rendererInstance; }
export function getFFmpegCommandGenerator(): FFmpegCommandGenerator { return new FFmpegCommandGenerator(); }
