/**
 * cache-key.mjs
 * TTS等の生成物をキャッシュするためのキー生成ユーティリティ
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * キャッシュキーを生成する
 * @param {object} options
 * @param {string} options.provider - プロバイダー名
 * @param {string} options.text - 入力テキスト
 * @param {string} options.voice_id - 音声ID（オプション）
 * @param {string} options.language - 言語（オプション）
 * @param {object} options.config - その他の設定（オプション）
 * @returns {string} - sha256 ハッシュ
 */
export function generateCacheKey(options) {
  const { provider, text, voice_id, language, config } = options;

  // キャッシュキーの元となるオブジェクト
  const keySource = {
    provider: provider || "unknown",
    text: text || "",
    voice_id: voice_id || "default",
    language: language || "en",
    // config から安定したキーのみを抽出
    ...(config?.model && { model: config.model }),
    ...(config?.stability && { stability: config.stability }),
    ...(config?.similarity_boost && { similarity_boost: config.similarity_boost }),
  };

  // JSON文字列化してハッシュ生成
  const jsonStr = JSON.stringify(keySource, Object.keys(keySource).sort());
  const hash = crypto.createHash("sha256").update(jsonStr).digest("hex");

  return hash;
}

/**
 * キャッシュディレクトリのパスを取得
 * @param {string} workdir - 作業ディレクトリ
 * @param {string} type - キャッシュタイプ（tts, lipsync など）
 * @returns {string}
 */
export function getCacheDir(workdir, type = "tts") {
  return path.join(workdir, "cache", type);
}

/**
 * キャッシュファイルのパスを取得
 * @param {string} workdir - 作業ディレクトリ
 * @param {string} cacheKey - キャッシュキー
 * @param {string} extension - ファイル拡張子
 * @param {string} type - キャッシュタイプ
 * @returns {string}
 */
export function getCachePath(workdir, cacheKey, extension = "mp3", type = "tts") {
  const cacheDir = getCacheDir(workdir, type);
  return path.join(cacheDir, `${cacheKey}.${extension}`);
}

/**
 * キャッシュが存在するか確認
 * @param {string} cachePath - キャッシュファイルパス
 * @returns {boolean}
 */
export function cacheExists(cachePath) {
  return fs.existsSync(cachePath);
}

/**
 * キャッシュディレクトリを作成
 * @param {string} workdir - 作業ディレクトリ
 * @param {string} type - キャッシュタイプ
 */
export function ensureCacheDir(workdir, type = "tts") {
  const cacheDir = getCacheDir(workdir, type);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
}

/**
 * キャッシュを利用して音声生成を行う（ラッパー関数）
 * @param {object} options
 * @param {string} options.workdir - 作業ディレクトリ
 * @param {string} options.provider - プロバイダー名
 * @param {string} options.text - 入力テキスト
 * @param {string} options.voice_id - 音声ID
 * @param {string} options.language - 言語
 * @param {object} options.config - プロバイダー設定
 * @param {Function} options.generateFn - 実際の生成関数
 * @returns {Promise<{ path: string, cached: boolean }>}
 */
export async function withCache(options) {
  const { workdir, provider, text, voice_id, language, config, generateFn, outputPath } = options;

  // キャッシュキーを生成
  const cacheKey = generateCacheKey({
    provider,
    text,
    voice_id,
    language,
    config,
  });

  // キャッシュパスを取得
  const cachePath = getCachePath(workdir, cacheKey, "mp3", "tts");

  // キャッシュが存在する場合
  if (cacheExists(cachePath)) {
    console.log(`  [Cache] HIT: ${cacheKey.substring(0, 16)}...`);

    // キャッシュを出力パスにコピー
    if (outputPath && outputPath !== cachePath) {
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.copyFileSync(cachePath, outputPath);
    }

    return {
      path: outputPath || cachePath,
      cached: true,
      cacheKey,
    };
  }

  console.log(`  [Cache] MISS: ${cacheKey.substring(0, 16)}...`);

  // キャッシュディレクトリを作成
  ensureCacheDir(workdir, "tts");

  // 生成を実行
  const result = await generateFn();

  // 生成結果をキャッシュにコピー
  if (result.path && fs.existsSync(result.path)) {
    fs.copyFileSync(result.path, cachePath);
  }

  return {
    ...result,
    cached: false,
    cacheKey,
  };
}

export default {
  generateCacheKey,
  getCacheDir,
  getCachePath,
  cacheExists,
  ensureCacheDir,
  withCache,
};
