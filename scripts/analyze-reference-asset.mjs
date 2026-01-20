#!/usr/bin/env node
/**
 * TAISUN Deterministic Reference Analyzer
 *
 * 仕様: docs/taisun_master_guard_spec.yaml
 * - 参考入力を決定的に解析
 * - sha256/寸法/メタ/フレームhash等を artifacts/reference_analysis.json に残す
 * - "分析したことにする" を不可能化
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const ARTIFACTS_DIR = path.resolve('.claude/artifacts');
const OUTPUT_FILE = path.join(ARTIFACTS_DIR, 'reference_analysis.json');

/**
 * ファイルのsha256を計算
 */
function calculateSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * 画像のメタデータを取得（ffprobeを使用）
 */
function getImageMetadata(filePath) {
  try {
    const result = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
      { encoding: 'utf8' }
    );
    const data = JSON.parse(result);
    const stream = data.streams?.[0] || {};
    return {
      width: stream.width || null,
      height: stream.height || null,
      format: stream.codec_name || path.extname(filePath).slice(1)
    };
  } catch (e) {
    // フォールバック: 拡張子のみ
    return {
      width: null,
      height: null,
      format: path.extname(filePath).slice(1)
    };
  }
}

/**
 * 動画のメタデータを取得
 */
function getVideoMetadata(filePath) {
  try {
    const result = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
      { encoding: 'utf8' }
    );
    const data = JSON.parse(result);
    const format = data.format || {};
    const videoStream = data.streams?.find(s => s.codec_type === 'video') || {};

    return {
      duration_sec: parseFloat(format.duration) || null,
      fps: eval(videoStream.r_frame_rate) || null,
      width: videoStream.width || null,
      height: videoStream.height || null,
      format: format.format_name || path.extname(filePath).slice(1)
    };
  } catch (e) {
    return {
      duration_sec: null,
      fps: null,
      width: null,
      height: null,
      format: path.extname(filePath).slice(1)
    };
  }
}

/**
 * 動画からサンプルフレームのハッシュを取得
 */
function getVideoFrameHashes(filePath, sampleCount = 5) {
  const hashes = [];
  try {
    // 動画の長さを取得
    const durationResult = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: 'utf8' }
    ).trim();
    const duration = parseFloat(durationResult);

    if (!duration || duration <= 0) {
      return hashes;
    }

    // サンプルフレームを抽出してハッシュ計算
    const interval = duration / (sampleCount + 1);
    for (let i = 1; i <= sampleCount; i++) {
      const timestamp = interval * i;
      const tempFile = `/tmp/frame_${i}_${Date.now()}.png`;
      try {
        execSync(
          `ffmpeg -y -ss ${timestamp} -i "${filePath}" -vframes 1 -f image2 "${tempFile}" 2>/dev/null`
        );
        if (fs.existsSync(tempFile)) {
          const hash = calculateSha256(tempFile);
          hashes.push({
            timestamp: timestamp.toFixed(2),
            sha256: hash
          });
          fs.unlinkSync(tempFile);
        }
      } catch (e) {
        // フレーム抽出失敗は無視
      }
    }
  } catch (e) {
    // エラーは無視
  }
  return hashes;
}

/**
 * アセットタイプを判定
 */
function detectAssetType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'];
  const videoExts = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv'];

  if (imageExts.includes(ext)) return 'image';
  if (videoExts.includes(ext)) return 'video';
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return 'url';
  return 'file';
}

/**
 * アセットを解析
 */
function analyzeAsset(assetPath, assetId = null) {
  const id = assetId || path.basename(assetPath);
  const type = detectAssetType(assetPath);

  const analysis = {
    asset_id: id,
    type: type,
    path: assetPath,
    sha256: null,
    metadata: {},
    derived_features: {},
    timestamp: new Date().toISOString()
  };

  // URLの場合は限定的な分析
  if (type === 'url') {
    analysis.metadata = { url: assetPath };
    return analysis;
  }

  // ファイルが存在しない場合
  if (!fs.existsSync(assetPath)) {
    analysis.error = 'File not found';
    return analysis;
  }

  // sha256計算
  analysis.sha256 = calculateSha256(assetPath);

  // タイプ別のメタデータ取得
  if (type === 'image') {
    const meta = getImageMetadata(assetPath);
    analysis.metadata = meta;
    analysis.derived_features = {
      width: meta.width,
      height: meta.height,
      format: meta.format
    };
  } else if (type === 'video') {
    const meta = getVideoMetadata(assetPath);
    analysis.metadata = meta;
    analysis.derived_features = {
      duration_sec: meta.duration_sec,
      fps: meta.fps,
      frame_hashes_sampled: getVideoFrameHashes(assetPath)
    };
  } else {
    // 一般ファイル
    const stats = fs.statSync(assetPath);
    analysis.metadata = {
      size: stats.size,
      mtime: stats.mtime.toISOString()
    };
  }

  return analysis;
}

/**
 * 既存の分析結果を読み込み
 */
function loadExistingAnalysis() {
  try {
    if (fs.existsSync(OUTPUT_FILE)) {
      return JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    }
  } catch (e) {
    // エラーは無視
  }
  return { version: 1, assets: [], lastUpdated: null };
}

/**
 * 分析結果を保存
 */
function saveAnalysis(analysis) {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }
  analysis.lastUpdated = new Date().toISOString();
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(analysis, null, 2), 'utf8');
}

/**
 * メイン処理
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
TAISUN Deterministic Reference Analyzer

使い方:
  node scripts/analyze-reference-asset.mjs <asset-path> [--id <asset-id>]
  node scripts/analyze-reference-asset.mjs --list
  node scripts/analyze-reference-asset.mjs --verify <asset-id>

オプション:
  --id <asset-id>    アセットIDを指定（省略時はファイル名）
  --list             現在の分析結果を表示
  --verify <id>      指定アセットのsha256を検証
  --help             このヘルプを表示
`);
    process.exit(0);
  }

  // --list: 分析結果を表示
  if (args.includes('--list')) {
    const analysis = loadExistingAnalysis();
    console.log(JSON.stringify(analysis, null, 2));
    process.exit(0);
  }

  // --verify: sha256を検証
  const verifyIndex = args.indexOf('--verify');
  if (verifyIndex !== -1) {
    const assetId = args[verifyIndex + 1];
    if (!assetId) {
      console.error('Error: --verify requires asset-id');
      process.exit(1);
    }

    const analysis = loadExistingAnalysis();
    const asset = analysis.assets.find(a => a.asset_id === assetId);
    if (!asset) {
      console.error(`Error: Asset not found: ${assetId}`);
      process.exit(1);
    }

    if (!fs.existsSync(asset.path)) {
      console.error(`Error: File not found: ${asset.path}`);
      process.exit(1);
    }

    const currentSha256 = calculateSha256(asset.path);
    if (currentSha256 === asset.sha256) {
      console.log(`✅ SHA256 一致: ${assetId}`);
      process.exit(0);
    } else {
      console.error(`❌ SHA256 不一致: ${assetId}`);
      console.error(`  登録: ${asset.sha256}`);
      console.error(`  現在: ${currentSha256}`);
      process.exit(1);
    }
  }

  // アセット解析
  const assetPath = args[0];
  const idIndex = args.indexOf('--id');
  const assetId = idIndex !== -1 ? args[idIndex + 1] : null;

  console.log(`📊 アセット解析中: ${assetPath}`);

  const result = analyzeAsset(assetPath, assetId);

  // 既存の分析結果に追加
  const analysis = loadExistingAnalysis();

  // 同じIDのアセットがあれば更新、なければ追加
  const existingIndex = analysis.assets.findIndex(a => a.asset_id === result.asset_id);
  if (existingIndex !== -1) {
    analysis.assets[existingIndex] = result;
    console.log(`🔄 更新: ${result.asset_id}`);
  } else {
    analysis.assets.push(result);
    console.log(`➕ 追加: ${result.asset_id}`);
  }

  saveAnalysis(analysis);

  console.log(`\n✅ 分析完了`);
  console.log(`  SHA256: ${result.sha256 || 'N/A'}`);
  console.log(`  タイプ: ${result.type}`);
  console.log(`  出力: ${OUTPUT_FILE}`);
}

main();
