/**
 * elevenlabs.mjs - ElevenLabs TTS プロバイダー
 * 本番環境で高品質な音声を生成する
 */

import fs from "fs";
import path from "path";
import https from "https";

export const name = "elevenlabs";

// デフォルト設定
const DEFAULT_MODEL = "eleven_multilingual_v2";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

/**
 * ElevenLabs API で音声を生成する
 * @param {object} options
 * @param {string} options.text - 読み上げるテキスト
 * @param {string} options.outputPath - 出力ファイルパス
 * @param {number} options.durationMs - 音声の長さ（参考値、ElevenLabsでは使用しない）
 * @param {object} options.config - プロバイダー設定
 * @returns {Promise<{ success: boolean, path: string, cached: boolean }>}
 */
export async function generate(options) {
  const { text, outputPath, config } = options;

  // API キーを取得
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }

  // 設定を取得
  const voiceId = config?.voice_id || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const model = config?.model || DEFAULT_MODEL;

  // 出力ディレクトリを作成
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`  [TTS:elevenlabs] Generating audio for "${text.substring(0, 50)}..."`);
  console.log(`  [TTS:elevenlabs] Voice: ${voiceId}, Model: ${model}`);

  try {
    await callElevenLabsApi({
      text,
      voiceId,
      model,
      apiKey,
      outputPath,
      stability: config?.stability || 0.5,
      similarity_boost: config?.similarity_boost || 0.75,
    });

    return {
      success: true,
      path: outputPath,
      cached: false,
      provider: "elevenlabs",
    };
  } catch (error) {
    console.error(`  [TTS:elevenlabs] Error: ${error.message}`);
    throw error;
  }
}

/**
 * ElevenLabs API を呼び出す
 */
function callElevenLabsApi(options) {
  const { text, voiceId, model, apiKey, outputPath, stability, similarity_boost } = options;

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      text,
      model_id: model,
      voice_settings: {
        stability,
        similarity_boost,
      },
    });

    const requestOptions = {
      hostname: "api.elevenlabs.io",
      port: 443,
      path: `/v1/text-to-speech/${voiceId}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(requestOptions, (res) => {
      if (res.statusCode !== 200) {
        let errorBody = "";
        res.on("data", (chunk) => {
          errorBody += chunk;
        });
        res.on("end", () => {
          reject(new Error(`ElevenLabs API error: ${res.statusCode} - ${errorBody}`));
        });
        return;
      }

      const fileStream = fs.createWriteStream(outputPath);
      res.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close();
        resolve();
      });

      fileStream.on("error", (error) => {
        fs.unlink(outputPath, () => {}); // 失敗時は削除
        reject(error);
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * プロバイダーが利用可能か確認
 * @returns {Promise<boolean>}
 */
export async function isAvailable() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn("[TTS:elevenlabs] ELEVENLABS_API_KEY is not set");
    return false;
  }
  return true;
}

export default {
  name,
  generate,
  isAvailable,
};
