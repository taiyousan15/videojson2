#!/usr/bin/env node
/**
 * materialize-render.mjs
 * render.json のアセット参照を実ファイルパスに解決して render.materialized.json を出力する
 * TTS プロバイダーを使用して音声ファイルも生成する
 *
 * 使い方:
 *   node scripts/materialize-render.mjs --render examples/smoke/render.json
 *
 * オプション:
 *   --render <path>       render.json のパス（必須）
 *   --output <path>       出力ファイルパス（デフォルト: 入力と同じディレクトリに .materialized.json）
 *   --project <path>      プロジェクトルート（デフォルト: render.json があるディレクトリ）
 *   --tts-provider <name> TTS プロバイダー（dummy / elevenlabs）
 *   --workdir <path>      作業ディレクトリ（デフォルト: .tmp）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveAllAssets } from "./lib/resolve-asset.mjs";
import { generateAudio } from "./providers/tts/index.mjs";
import { getLipsyncProvider } from "./providers/lipsync/index.mjs";
import { withCache } from "./lib/cache-key.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(args) {
  const result = {
    render: null,
    output: null,
    project: null,
    ttsProvider: null,
    lipsyncProvider: null,
    workdir: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--render" && args[i + 1]) {
      result.render = args[++i];
    } else if (args[i] === "--output" && args[i + 1]) {
      result.output = args[++i];
    } else if (args[i] === "--project" && args[i + 1]) {
      result.project = args[++i];
    } else if (args[i] === "--tts-provider" && args[i + 1]) {
      result.ttsProvider = args[++i];
    } else if (args[i] === "--lipsync-provider" && args[i + 1]) {
      result.lipsyncProvider = args[++i];
    } else if (args[i] === "--workdir" && args[i + 1]) {
      result.workdir = args[++i];
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/materialize-render.mjs --render <path>

Options:
  --render <path>           Path to render.json (required)
  --output <path>           Output file path (default: render.materialized.json in same dir)
  --project <path>          Project root directory (default: render.json directory)
  --tts-provider <name>     TTS provider (dummy / elevenlabs)
  --lipsync-provider <name> Lipsync provider (dummy / http / local)
  --workdir <path>          Working directory for generated files (default: .tmp)

Environment Variables:
  VIDEOJSON_TTS_PROVIDER     Default TTS provider (dummy / elevenlabs)
  VIDEOJSON_LIPSYNC_PROVIDER Default Lipsync provider (dummy)
  VIDEOJSON_WORKDIR          Default working directory

Example:
  node scripts/materialize-render.mjs --render examples/smoke/render.json
  node scripts/materialize-render.mjs --render render.json --tts-provider elevenlabs
  node scripts/materialize-render.mjs --render render.json --lipsync-provider dummy
`);
}

/**
 * TTS が必要なセグメントの音声を生成する
 */
async function processTtsSegments(renderJson, projectRoot, workdir, ttsProvider) {
  const generatedAssets = [];

  for (const segment of renderJson.segments || []) {
    if (segment.audio?.mode === "tts" && segment.audio?.script) {
      console.log(`\n[TTS] Processing segment ${segment.id}`);

      const audioFilename = `${segment.id}_tts.mp3`;
      const audioDir = path.join(workdir, "audio");
      const audioPath = path.join(audioDir, audioFilename);

      // ディレクトリ作成
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }

      // TTS 設定を取得
      const ttsConfig = renderJson.providers?.tts || {};

      try {
        // キャッシュを使用して生成
        const result = await withCache({
          workdir,
          provider: ttsProvider,
          text: segment.audio.script,
          voice_id: ttsConfig.voice_id,
          language: ttsConfig.language,
          config: ttsConfig,
          outputPath: audioPath,
          generateFn: async () => {
            return await generateAudio({
              text: segment.audio.script,
              outputPath: audioPath,
              durationMs: segment.duration_ms,
              provider: ttsProvider,
              config: {
                voice_id: ttsConfig.voice_id,
                language: ttsConfig.language,
                ...ttsConfig,
              },
            });
          },
        });

        const cacheStatus = result.cached ? "cached" : "generated";
        console.log(`  [TTS] ${cacheStatus}: ${result.path} (provider: ${ttsProvider})`);

        // 生成したアセットを登録
        const assetId = `generated_audio_${segment.id}`;
        generatedAssets.push({
          id: assetId,
          type: "audio",
          uri: audioPath,
          _resolved_path: audioPath,
          _exists: true,
          _generated: true,
          _cached: result.cached,
        });

        // セグメントの audio を更新（mode を uploaded に変更し asset_id を設定）
        segment.audio._original_mode = segment.audio.mode;
        segment.audio._original_script = segment.audio.script;
        segment.audio.mode = "uploaded";
        segment.audio.asset_id = assetId;
        segment.audio._resolved_path = audioPath;
      } catch (error) {
        console.error(`  [TTS] Error generating audio for ${segment.id}: ${error.message}`);
        throw error;
      }
    }
  }

  // 生成したアセットを assets 配列に追加
  if (generatedAssets.length > 0) {
    renderJson.assets = renderJson.assets || [];
    renderJson.assets.push(...generatedAssets);
  }

  return generatedAssets;
}

/**
 * アセットIDからファイルパスを取得するヘルパー
 */
function getAssetPath(renderJson, assetId) {
  const asset = (renderJson.assets || []).find((a) => a.id === assetId);
  if (!asset) {
    return null;
  }
  return asset._resolved_path || asset.uri;
}

/**
 * Lipsync が必要なセグメントの動画を生成する
 */
async function processLipsyncSegments(renderJson, projectRoot, workdir, lipsyncProviderName) {
  const generatedAssets = [];
  const lipsyncInfo = {
    used: false,
    provider: lipsyncProviderName,
    segments: [],
    face_asset_ids: [],
  };

  // lipsync プロバイダーを取得
  const provider = getLipsyncProvider(lipsyncProviderName);

  // プロバイダーの利用可否をチェック
  const checkResult = await provider.check();
  if (!checkResult.available) {
    console.warn(`[WARN] Lipsync provider "${lipsyncProviderName}" is not available: ${checkResult.reason}`);
    if (checkResult.hint) {
      console.warn(`       Hint: ${checkResult.hint}`);
    }
    return { generatedAssets, lipsyncInfo };
  }

  for (const segment of renderJson.segments || []) {
    if (segment.video?.mode === "lipsync" && segment.video?.lipsync?.face_asset_id) {
      console.log(`\n[LIPSYNC] Processing segment ${segment.id}`);

      const lipsyncConfig = segment.video.lipsync;
      const faceAssetId = lipsyncConfig.face_asset_id;

      // 顔画像アセットを解決
      const facePath = getAssetPath(renderJson, faceAssetId);
      if (!facePath || !fs.existsSync(facePath)) {
        throw new Error(`Face asset not found: ${faceAssetId} (path: ${facePath})`);
      }

      // 顔画像アセットの consent を確認
      const faceAsset = (renderJson.assets || []).find((a) => a.id === faceAssetId);
      if (!faceAsset?.meta?.consent) {
        throw new Error(
          `Consent required for face asset "${faceAssetId}".\n` +
          `Set meta.consent=true in the asset definition to confirm you have permission to use this face.`
        );
      }

      // 音声アセットを解決
      const audioAssetId = segment.audio?.asset_id;
      if (!audioAssetId) {
        throw new Error(`Audio asset_id required for lipsync segment ${segment.id}`);
      }
      const audioPath = getAssetPath(renderJson, audioAssetId);
      if (!audioPath || !fs.existsSync(audioPath)) {
        throw new Error(`Audio asset not found: ${audioAssetId} (path: ${audioPath})`);
      }

      // 出力設定
      const outputSettings = renderJson.output || {};
      const videoFilename = `${segment.id}_lipsync.mp4`;
      const videoDir = path.join(workdir, "video");
      const videoPath = path.join(videoDir, videoFilename);

      // ディレクトリ作成
      if (!fs.existsSync(videoDir)) {
        fs.mkdirSync(videoDir, { recursive: true });
      }

      // 透かし設定
      const watermark = lipsyncConfig.watermark || { enabled: true, text: "AI Generated" };

      try {
        console.log(`  [LIPSYNC] Face: ${faceAssetId}, Audio: ${audioAssetId}`);

        const result = await provider.generate({
          facePath,
          audioPath,
          outPath: videoPath,
          width: outputSettings.width || 1920,
          height: outputSettings.height || 1080,
          fps: outputSettings.fps || 30,
          durationMs: segment.duration_ms,
          watermark,
          cacheDir: path.join(workdir, "cache", "lipsync"),
        });

        const cacheStatus = result.cached ? "cached" : "generated";
        console.log(`  [LIPSYNC] ${cacheStatus}: ${result.outPath}`);

        // 生成したアセットを登録
        const assetId = `generated_video_${segment.id}`;
        generatedAssets.push({
          id: assetId,
          type: "video",
          uri: videoPath,
          _resolved_path: videoPath,
          _exists: true,
          _generated: true,
          _lipsync: true,
          _cached: result.cached,
          meta: {
            consent: true,
            source: "lipsync_generated",
            face_asset_id: faceAssetId,
          },
        });

        // セグメントの video を更新（mode を reuse_original に変更）
        segment.video._original_mode = segment.video.mode;
        segment.video._original_lipsync = segment.video.lipsync;
        segment.video.mode = "reuse_original";
        segment.video.source = {
          asset_id: assetId,
          in_ms: 0,
          out_ms: segment.duration_ms,
        };
        delete segment.video.lipsync;

        // lipsync 情報を記録
        lipsyncInfo.used = true;
        lipsyncInfo.segments.push(segment.id);
        if (!lipsyncInfo.face_asset_ids.includes(faceAssetId)) {
          lipsyncInfo.face_asset_ids.push(faceAssetId);
        }
      } catch (error) {
        console.error(`  [LIPSYNC] Error generating video for ${segment.id}: ${error.message}`);
        throw error;
      }
    }
  }

  // 生成したアセットを assets 配列に追加
  if (generatedAssets.length > 0) {
    renderJson.assets = renderJson.assets || [];
    renderJson.assets.push(...generatedAssets);
  }

  return { generatedAssets, lipsyncInfo };
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
    console.error(`Error: render.json not found: ${renderPath}`);
    process.exit(1);
  }

  // プロジェクトルートを決定
  const projectRoot = args.project
    ? path.resolve(args.project)
    : path.dirname(renderPath);

  // 作業ディレクトリを決定
  const workdir = args.workdir
    ? path.resolve(args.workdir)
    : path.resolve(projectRoot, process.env.VIDEOJSON_WORKDIR || ".tmp");

  // TTS プロバイダーを決定
  const ttsProvider = args.ttsProvider || process.env.VIDEOJSON_TTS_PROVIDER || "dummy";

  // Lipsync プロバイダーを決定
  const lipsyncProvider = args.lipsyncProvider || process.env.VIDEOJSON_LIPSYNC_PROVIDER || "dummy";

  // 出力パスを決定
  const outputPath = args.output
    ? path.resolve(args.output)
    : renderPath.replace(/\.json$/, ".materialized.json");

  console.log("=== Materialize Render ===\n");
  console.log(`Input:           ${renderPath}`);
  console.log(`Project root:    ${projectRoot}`);
  console.log(`Work dir:        ${workdir}`);
  console.log(`TTS provider:    ${ttsProvider}`);
  console.log(`Lipsync provider: ${lipsyncProvider}`);
  console.log(`Output:          ${outputPath}`);

  // render.json を読み込み
  let renderJson;
  try {
    renderJson = JSON.parse(fs.readFileSync(renderPath, "utf-8"));
  } catch (error) {
    console.error(`Error parsing render.json: ${error.message}`);
    process.exit(1);
  }

  // TTS セグメントの処理
  console.log("\n=== TTS Processing ===");
  const ttsSegments = (renderJson.segments || []).filter(
    (s) => s.audio?.mode === "tts" && s.audio?.script
  );

  if (ttsSegments.length > 0) {
    console.log(`Found ${ttsSegments.length} TTS segment(s)`);
    await processTtsSegments(renderJson, projectRoot, workdir, ttsProvider);
  } else {
    console.log("No TTS segments found");
  }

  // 最初のアセット解決（TTS後、Lipsync前）
  // lipsync処理のために必要なアセット（顔画像、音声）を解決
  console.log("\n=== Initial Asset Resolution ===");
  const { resolved: initialResolved } = resolveAllAssets(renderJson, projectRoot);
  // 解決結果をrenderJsonにマージ（_resolved_pathなどを追加）
  renderJson.assets = initialResolved.assets;

  // Lipsync セグメントの処理
  console.log("\n=== Lipsync Processing ===");
  const lipsyncSegments = (renderJson.segments || []).filter(
    (s) => s.video?.mode === "lipsync" && s.video?.lipsync?.face_asset_id
  );

  let lipsyncInfo = { used: false, provider: lipsyncProvider, segments: [], face_asset_ids: [] };
  if (lipsyncSegments.length > 0) {
    console.log(`Found ${lipsyncSegments.length} Lipsync segment(s)`);
    const result = await processLipsyncSegments(renderJson, projectRoot, workdir, lipsyncProvider);
    lipsyncInfo = result.lipsyncInfo;
  } else {
    console.log("No Lipsync segments found");
  }

  // 最終アセット解決（Lipsync後）
  console.log("\n=== Final Asset Resolution ===");
  const { resolved, errors } = resolveAllAssets(renderJson, projectRoot);

  // エラーがあれば報告
  if (errors.length > 0) {
    console.error("\n=== Asset Resolution Errors ===\n");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    console.error(`\nTotal errors: ${errors.length}`);
    process.exit(1);
  }

  // 解決済みアセットの情報を表示
  console.log("\n=== Resolved Assets ===\n");
  if (resolved.assets && resolved.assets.length > 0) {
    for (const asset of resolved.assets) {
      const status = asset._exists ? "OK" : "MISSING";
      const generated = asset._generated ? " (generated)" : "";
      console.log(`  [${status}] ${asset.id}: ${asset._resolved_path}${generated}`);
    }
  } else {
    console.log("  (no assets defined)");
  }

  // lipsync 情報を追加（manifest生成用）
  if (lipsyncInfo.used) {
    resolved._lipsync = lipsyncInfo;
    console.log(`\n=== Lipsync Summary ===`);
    console.log(`  Provider: ${lipsyncInfo.provider}`);
    console.log(`  Segments: ${lipsyncInfo.segments.join(", ")}`);
    console.log(`  Face assets: ${lipsyncInfo.face_asset_ids.join(", ")}`);
  }

  // materialized.json を出力
  try {
    fs.writeFileSync(outputPath, JSON.stringify(resolved, null, 2));
    console.log(`\n=== Success ===`);
    console.log(`Output written to: ${outputPath}`);
  } catch (error) {
    console.error(`Error writing output: ${error.message}`);
    process.exit(1);
  }
}

main();
