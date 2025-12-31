/**
 * Dummy Lipsync Provider
 *
 * CIおよび開発用のダミープロバイダー
 * 静止画をループし、音声を合成してmp4を生成する
 * 軽いズーム/パンエフェクトで「動いている感」を出す
 *
 * 重要: これは実際のリップシンクではなく、パイプライン検証用
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * キャッシュキーを生成
 */
function generateCacheKey(facePath, audioPath, options) {
  const faceHash = fs.existsSync(facePath)
    ? crypto.createHash('md5').update(fs.readFileSync(facePath)).digest('hex').slice(0, 8)
    : 'noface';
  const audioHash = fs.existsSync(audioPath)
    ? crypto.createHash('md5').update(fs.readFileSync(audioPath)).digest('hex').slice(0, 8)
    : 'noaudio';
  const optionsHash = crypto.createHash('md5')
    .update(JSON.stringify({ w: options.width, h: options.height, fps: options.fps }))
    .digest('hex').slice(0, 8);

  return `lipsync_dummy_${faceHash}_${audioHash}_${optionsHash}`;
}

/**
 * Dummy Provider を作成
 */
export function createDummyProvider() {
  return {
    name: 'dummy',

    /**
     * リップシンク動画を生成（ダミー実装）
     *
     * @param {object} options
     * @param {string} options.facePath - 顔画像のパス
     * @param {string} options.audioPath - 音声ファイルのパス
     * @param {string} options.outPath - 出力動画のパス
     * @param {number} options.width - 出力幅
     * @param {number} options.height - 出力高さ
     * @param {number} options.fps - フレームレート
     * @param {number} options.durationMs - 動画の長さ（ミリ秒）
     * @param {object} options.watermark - 透かし設定
     * @param {string} options.cacheDir - キャッシュディレクトリ
     * @returns {Promise<{outPath: string, cached: boolean}>}
     */
    async generate(options) {
      const {
        facePath,
        audioPath,
        outPath,
        width = 1920,
        height = 1080,
        fps = 30,
        durationMs,
        watermark = { enabled: true, text: 'AI Generated' },
        cacheDir,
      } = options;

      // 入力検証
      if (!facePath || !fs.existsSync(facePath)) {
        throw new Error(`Face image not found: ${facePath}`);
      }
      if (!audioPath || !fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      // キャッシュチェック
      const cacheKey = generateCacheKey(facePath, audioPath, options);
      if (cacheDir) {
        const cachedPath = path.join(cacheDir, `${cacheKey}.mp4`);
        if (fs.existsSync(cachedPath)) {
          // キャッシュから出力先にコピー
          fs.copyFileSync(cachedPath, outPath);
          return { outPath, cached: true };
        }
      }

      // 出力ディレクトリ作成
      const outDir = path.dirname(outPath);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      // 音声の長さを取得
      let audioDuration = durationMs / 1000;
      try {
        const probeResult = execSync(
          `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`,
          { encoding: 'utf8' }
        ).trim();
        if (probeResult) {
          audioDuration = parseFloat(probeResult);
        }
      } catch {
        // フォールバック: durationMs を使用
      }

      // ffmpegコマンド構築
      // Ken Burnsエフェクト（軽いズーム）を適用
      const zoomSpeed = 0.0003; // ゆっくりズーム
      const zoomFilter = `zoompan=z='min(zoom+${zoomSpeed},1.1)':d=${Math.ceil(audioDuration * fps)}:s=${width}x${height}:fps=${fps}`;

      // 透かしフィルター
      let watermarkFilter = '';
      if (watermark?.enabled !== false) {
        const text = watermark?.text || 'AI Generated';
        // 右下に小さく表示
        watermarkFilter = `,drawtext=text='${text}':fontsize=16:fontcolor=white@0.5:x=w-tw-10:y=h-th-10`;
      }

      // ffmpegコマンド
      const ffmpegArgs = [
        '-y',
        '-loop', '1',
        '-i', facePath,
        '-i', audioPath,
        '-c:v', 'libx264',
        '-tune', 'stillimage',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-pix_fmt', 'yuv420p',
        '-vf', `${zoomFilter}${watermarkFilter}`,
        '-shortest',
        '-movflags', '+faststart',
        outPath,
      ];

      console.log(`[lipsync/dummy] Generating video: ${path.basename(outPath)}`);
      console.log(`[lipsync/dummy] Face: ${path.basename(facePath)}, Audio: ${path.basename(audioPath)}`);
      console.log(`[lipsync/dummy] Duration: ${audioDuration.toFixed(2)}s, Size: ${width}x${height}`);

      const result = spawnSync('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf8',
      });

      if (result.status !== 0) {
        const stderr = result.stderr || '';
        throw new Error(`ffmpeg failed: ${stderr.slice(-500)}`);
      }

      // 出力確認
      if (!fs.existsSync(outPath)) {
        throw new Error(`Output file not created: ${outPath}`);
      }

      // キャッシュに保存
      if (cacheDir) {
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        const cachedPath = path.join(cacheDir, `${cacheKey}.mp4`);
        fs.copyFileSync(outPath, cachedPath);
      }

      console.log(`[lipsync/dummy] Generated: ${outPath}`);

      return { outPath, cached: false };
    },

    /**
     * プロバイダーが利用可能か確認
     */
    async check() {
      try {
        execSync('ffmpeg -version', { stdio: 'pipe' });
        return { available: true };
      } catch {
        return {
          available: false,
          reason: 'ffmpeg is not installed or not in PATH',
          hint: 'Install ffmpeg: brew install ffmpeg (macOS) or apt-get install ffmpeg (Ubuntu)',
        };
      }
    },
  };
}

export default { createDummyProvider };
