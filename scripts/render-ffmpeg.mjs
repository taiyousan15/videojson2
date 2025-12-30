#!/usr/bin/env node
/**
 * render-ffmpeg.mjs
 * render.materialized.json から FFmpeg を使って最終動画を生成する
 *
 * 使い方:
 *   node scripts/render-ffmpeg.mjs --render examples/smoke/render.materialized.json
 *
 * オプション:
 *   --render <path>   render.materialized.json のパス（必須）
 *   --output <path>   出力ファイルパス（デフォルト: output で指定された filename）
 *   --temp <path>     一時ファイルディレクトリ（デフォルト: .render_temp/）
 *   --keep-temp       一時ファイルを削除しない
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateSrt } from "./generate-srt.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(args) {
  const result = {
    render: null,
    output: null,
    temp: null,
    keepTemp: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--render" && args[i + 1]) {
      result.render = args[++i];
    } else if (args[i] === "--output" && args[i + 1]) {
      result.output = args[++i];
    } else if (args[i] === "--temp" && args[i + 1]) {
      result.temp = args[++i];
    } else if (args[i] === "--keep-temp") {
      result.keepTemp = true;
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/render-ffmpeg.mjs --render <path>

Options:
  --render <path>   Path to render.materialized.json (required)
  --output <path>   Output file path (default: from output.filename)
  --temp <path>     Temp directory (default: .render_temp/)
  --keep-temp       Keep temp files after rendering

Example:
  node scripts/render-ffmpeg.mjs --render examples/smoke/render.materialized.json
`);
}

function runFfmpeg(args, description) {
  const cmd = `ffmpeg ${args}`;
  console.log(`  [FFmpeg] ${description}`);
  try {
    execSync(cmd, { stdio: "pipe" });
  } catch (error) {
    console.error(`  [ERROR] FFmpeg failed: ${error.message}`);
    throw error;
  }
}

// 動画切り出し（reuse_original）
function processReuseOriginal(segment, renderJson, tempDir, outputSpec) {
  const source = segment.video.source;

  // source が無い場合はプレースホルダー動画を生成
  if (!source || !source.asset_id) {
    console.log(`  [WARN] No source asset for ${segment.id}, generating placeholder`);
    return generatePlaceholderVideo(segment, tempDir, outputSpec);
  }

  const asset = renderJson.assets?.find((a) => a.id === source.asset_id);

  if (!asset || !asset._resolved_path) {
    console.log(`  [WARN] Asset not found: ${source.asset_id}, generating placeholder`);
    return generatePlaceholderVideo(segment, tempDir, outputSpec);
  }

  const inputPath = asset._resolved_path;
  const outputPath = path.join(tempDir, `${segment.id}_video.mp4`);

  const startSec = (source.in_ms || 0) / 1000;
  const durationSec = segment.duration_ms / 1000;

  runFfmpeg(
    `-y -ss ${startSec} -i "${inputPath}" -t ${durationSec} -c copy "${outputPath}"`,
    `Cutting ${segment.id} from ${path.basename(inputPath)}`
  );

  return outputPath;
}

// プレースホルダー動画を生成
function generatePlaceholderVideo(segment, tempDir, outputSpec) {
  const outputPath = path.join(tempDir, `${segment.id}_video.mp4`);
  const durationSec = segment.duration_ms / 1000;
  const width = outputSpec.width || 640;
  const height = outputSpec.height || 360;
  const fps = outputSpec.fps || 30;

  runFfmpeg(
    `-y -f lavfi -i color=c=black:s=${width}x${height}:d=${durationSec}:r=${fps} -c:v libx264 -pix_fmt yuv420p "${outputPath}"`,
    `Generating placeholder video for ${segment.id}`
  );

  return outputPath;
}

// 静止画→動画（static_image）
function processStaticImage(segment, renderJson, tempDir, outputSpec) {
  const source = segment.video.source;
  const asset = renderJson.assets.find((a) => a.id === source.asset_id);

  if (!asset || !asset._resolved_path) {
    throw new Error(`Asset not found: ${source.asset_id}`);
  }

  const inputPath = asset._resolved_path;
  const outputPath = path.join(tempDir, `${segment.id}_video.mp4`);

  const durationSec = segment.duration_ms / 1000;
  const width = outputSpec.width || 640;
  const height = outputSpec.height || 360;
  const fps = outputSpec.fps || 30;

  runFfmpeg(
    `-y -loop 1 -i "${inputPath}" -t ${durationSec} -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -pix_fmt yuv420p -r ${fps} "${outputPath}"`,
    `Converting ${segment.id} image to video`
  );

  return outputPath;
}

// 音声処理
function processAudio(segment, renderJson, tempDir) {
  const audioSpec = segment.audio;

  if (audioSpec.mode === "uploaded" && audioSpec.asset_id) {
    const asset = renderJson.assets.find((a) => a.id === audioSpec.asset_id);
    if (!asset || !asset._resolved_path) {
      throw new Error(`Audio asset not found: ${audioSpec.asset_id}`);
    }
    return asset._resolved_path;
  }

  if (audioSpec.mode === "tts") {
    // TTS は未実装、ダミー無音を生成
    const outputPath = path.join(tempDir, `${segment.id}_audio.mp3`);
    const durationSec = segment.duration_ms / 1000;
    runFfmpeg(
      `-y -f lavfi -i anullsrc=r=44100:cl=stereo:d=${durationSec} -c:a libmp3lame "${outputPath}"`,
      `Generating silence for ${segment.id} (TTS not implemented)`
    );
    return outputPath;
  }

  // use_original: 元動画の音声を使う（video と同じソースから抽出）
  if (audioSpec.mode === "use_original") {
    const videoSource = segment.video.source;
    if (videoSource?.asset_id) {
      const asset = renderJson.assets.find((a) => a.id === videoSource.asset_id);
      if (asset && asset._resolved_path) {
        const outputPath = path.join(tempDir, `${segment.id}_audio.mp3`);
        const startSec = (videoSource.in_ms || 0) / 1000;
        const durationSec = segment.duration_ms / 1000;
        runFfmpeg(
          `-y -ss ${startSec} -i "${asset._resolved_path}" -t ${durationSec} -vn -c:a libmp3lame "${outputPath}"`,
          `Extracting original audio for ${segment.id}`
        );
        return outputPath;
      }
    }
  }

  // デフォルト: 無音
  const outputPath = path.join(tempDir, `${segment.id}_audio_silent.mp3`);
  const durationSec = segment.duration_ms / 1000;
  runFfmpeg(
    `-y -f lavfi -i anullsrc=r=44100:cl=stereo:d=${durationSec} -c:a libmp3lame "${outputPath}"`,
    `Generating silence for ${segment.id}`
  );
  return outputPath;
}

// 動画と音声を合成
function mergeVideoAudio(videoPath, audioPath, outputPath, durationMs) {
  const durationSec = durationMs / 1000;
  runFfmpeg(
    `-y -i "${videoPath}" -i "${audioPath}" -map 0:v -map 1:a -c:v copy -c:a aac -t ${durationSec} -shortest "${outputPath}"`,
    `Merging video and audio`
  );
}

// セグメントを結合
function concatSegments(segmentPaths, outputPath, tempDir) {
  const listPath = path.join(tempDir, "segments.txt");
  const listContent = segmentPaths.map((p) => `file '${p}'`).join("\n");
  fs.writeFileSync(listPath, listContent);

  runFfmpeg(
    `-y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`,
    `Concatenating ${segmentPaths.length} segments`
  );
}

// 字幕を焼き込む
async function burnSubtitles(renderJson, videoPath, tempDir) {
  // SRT を生成
  const srtContent = generateSrt(renderJson);
  const srtPath = path.join(tempDir, "subtitles.srt");
  fs.writeFileSync(srtPath, srtContent);

  console.log(`  [SRT] Generated: ${srtPath}`);

  const subtitleCount = (srtContent.match(/^\d+$/gm) || []).length;
  if (subtitleCount === 0) {
    console.log("  [SRT] No subtitles to burn");
    return videoPath;
  }

  console.log(`  [SRT] Subtitles: ${subtitleCount}`);

  const outputPath = path.join(tempDir, "with_subtitles.mp4");

  // FFmpeg で字幕を焼き込む
  // subtitles フィルタを使用（libass が必要）
  // Windows のパス対応のため、パスのバックスラッシュをエスケープ
  const escapedSrtPath = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");

  try {
    runFfmpeg(
      `-y -i "${videoPath}" -vf "subtitles='${escapedSrtPath}':force_style='FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2'" -c:a copy "${outputPath}"`,
      "Burning subtitles"
    );
    return outputPath;
  } catch (error) {
    // libass が無い場合のフォールバック: drawtext を使う
    console.warn("  [WARN] subtitles filter failed, trying drawtext fallback");

    // drawtext は1行ずつしか描画できないので、最初の字幕だけ表示する簡易版
    // 本格的な実装は ASS/SRT パーサーが必要
    throw new Error("Subtitle burning not supported on this system. Install libass for ffmpeg.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.render) {
    console.error("Error: --render is required\n");
    showUsage();
    process.exit(1);
  }

  const renderPath = path.resolve(args.render);

  if (!fs.existsSync(renderPath)) {
    console.error(`Error: render file not found: ${renderPath}`);
    process.exit(1);
  }

  // render.json を読み込み
  let renderJson;
  try {
    renderJson = JSON.parse(fs.readFileSync(renderPath, "utf-8"));
  } catch (error) {
    console.error(`Error parsing render file: ${error.message}`);
    process.exit(1);
  }

  const projectRoot = path.dirname(renderPath);
  const tempDir = args.temp
    ? path.resolve(args.temp)
    : path.join(projectRoot, ".render_temp");

  const outputPath = args.output
    ? path.resolve(args.output)
    : path.join(projectRoot, renderJson.output?.filename || "output.mp4");

  console.log("=== Render FFmpeg ===\n");
  console.log(`Input:   ${renderPath}`);
  console.log(`Output:  ${outputPath}`);
  console.log(`Temp:    ${tempDir}\n`);

  // 一時ディレクトリ作成
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const outputSpec = renderJson.output || {};
  const segmentFinalPaths = [];

  try {
    // 各セグメントを処理
    console.log("=== Processing Segments ===\n");
    for (const segment of renderJson.segments) {
      console.log(`\nSegment: ${segment.id}`);

      // 動画処理
      let videoPath;
      if (segment.video.mode === "reuse_original") {
        videoPath = processReuseOriginal(segment, renderJson, tempDir, outputSpec);
      } else if (segment.video.mode === "static_image") {
        videoPath = processStaticImage(segment, renderJson, tempDir, outputSpec);
      } else if (segment.video.mode === "generate") {
        console.log(`  [WARN] generate mode not implemented, using black video`);
        const durationSec = segment.duration_ms / 1000;
        videoPath = path.join(tempDir, `${segment.id}_video.mp4`);
        runFfmpeg(
          `-y -f lavfi -i color=c=black:s=${outputSpec.width || 640}x${outputSpec.height || 360}:d=${durationSec} -c:v libx264 -pix_fmt yuv420p "${videoPath}"`,
          `Generating black video for ${segment.id}`
        );
      } else {
        throw new Error(`Unknown video mode: ${segment.video.mode}`);
      }

      // 音声処理
      const audioPath = processAudio(segment, renderJson, tempDir);

      // 合成
      const finalPath = path.join(tempDir, `${segment.id}_final.mp4`);
      mergeVideoAudio(videoPath, audioPath, finalPath, segment.duration_ms);

      segmentFinalPaths.push(finalPath);
    }

    // セグメント結合
    console.log("\n=== Concatenating Segments ===\n");
    const concatOutputPath = path.join(tempDir, "concat_output.mp4");
    concatSegments(segmentFinalPaths, concatOutputPath, tempDir);

    // 字幕処理
    let finalVideoPath = concatOutputPath;
    const captionsEnabled = renderJson.segments?.some(
      (s) => s.overlays?.captions?.enabled
    );

    if (captionsEnabled) {
      console.log("\n=== Burning Subtitles ===\n");
      try {
        finalVideoPath = await burnSubtitles(renderJson, concatOutputPath, tempDir);
      } catch (error) {
        console.warn(`[WARN] Subtitle burning failed: ${error.message}`);
        console.warn("[WARN] Continuing without subtitles");
        finalVideoPath = concatOutputPath;
      }
    }

    // 最終出力にコピー
    if (finalVideoPath !== outputPath) {
      fs.copyFileSync(finalVideoPath, outputPath);
    }

    console.log("\n=== Success ===");
    console.log(`Output: ${outputPath}`);

    // ファイルサイズを表示
    const stats = fs.statSync(outputPath);
    console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  } finally {
    // 一時ファイル削除
    if (!args.keepTemp && fs.existsSync(tempDir)) {
      console.log(`\nCleaning up temp directory: ${tempDir}`);
      fs.rmSync(tempDir, { recursive: true });
    }
  }
}

main();
