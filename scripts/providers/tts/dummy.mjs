/**
 * dummy.mjs - ダミー TTS プロバイダー
 * 無音音声ファイルを生成する（CI/テスト用）
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export const name = "dummy";

/**
 * 無音音声を生成する
 * @param {object} options
 * @param {string} options.text - 読み上げるテキスト（使用しない）
 * @param {string} options.outputPath - 出力ファイルパス
 * @param {number} options.durationMs - 音声の長さ（ミリ秒）
 * @param {object} options.config - プロバイダー設定（使用しない）
 * @returns {Promise<{ success: boolean, path: string, cached: boolean }>}
 */
export async function generate(options) {
  const { text, outputPath, durationMs, config } = options;

  const durationSec = (durationMs || 3000) / 1000;

  // 出力ディレクトリを作成
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`  [TTS:dummy] Generating silent audio (${durationSec}s)`);

  try {
    const cmd = [
      "ffmpeg",
      "-y",
      "-f lavfi",
      `-i anullsrc=r=44100:cl=stereo:d=${durationSec}`,
      "-c:a libmp3lame",
      `"${outputPath}"`,
    ].join(" ");

    execSync(cmd, { stdio: "pipe" });

    return {
      success: true,
      path: outputPath,
      cached: false,
      provider: "dummy",
    };
  } catch (error) {
    console.error(`  [TTS:dummy] Error: ${error.message}`);
    throw error;
  }
}

/**
 * プロバイダーが利用可能か確認
 * @returns {Promise<boolean>}
 */
export async function isAvailable() {
  try {
    execSync("ffmpeg -version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export default {
  name,
  generate,
  isAvailable,
};
