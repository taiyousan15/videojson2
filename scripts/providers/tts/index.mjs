/**
 * TTS Provider Index
 * プロバイダーの選択と管理を行う
 */

import * as dummyProvider from "./dummy.mjs";

// 利用可能なプロバイダーのレジストリ
const providers = {
  dummy: dummyProvider,
};

// 遅延ロード用（elevenlabs は後で追加）
const lazyProviders = {
  elevenlabs: async () => {
    try {
      return await import("./elevenlabs.mjs");
    } catch (error) {
      console.warn(`[TTS] Failed to load elevenlabs provider: ${error.message}`);
      return null;
    }
  },
};

/**
 * プロバイダーを取得する
 * @param {string} name - プロバイダー名
 * @returns {Promise<object|null>}
 */
export async function getProvider(name) {
  // 既にロード済みのプロバイダー
  if (providers[name]) {
    return providers[name];
  }

  // 遅延ロードを試みる
  if (lazyProviders[name]) {
    const provider = await lazyProviders[name]();
    if (provider) {
      providers[name] = provider;
      return provider;
    }
  }

  return null;
}

/**
 * 環境変数やオプションからプロバイダーを決定する
 * @param {string} requestedProvider - リクエストされたプロバイダー名
 * @returns {Promise<object>} - 使用するプロバイダー
 */
export async function resolveProvider(requestedProvider) {
  const providerName = requestedProvider || process.env.VIDEOJSON_TTS_PROVIDER || "dummy";

  console.log(`[TTS] Requested provider: ${providerName}`);

  // リクエストされたプロバイダーを取得
  const provider = await getProvider(providerName);

  if (provider) {
    // プロバイダーが利用可能か確認
    if (provider.isAvailable && !(await provider.isAvailable())) {
      console.warn(`[TTS] Provider "${providerName}" is not available, falling back to dummy`);
      return providers.dummy;
    }
    return provider;
  }

  // 見つからない場合は dummy にフォールバック
  console.warn(`[TTS] Provider "${providerName}" not found, falling back to dummy`);
  return providers.dummy;
}

/**
 * 音声を生成する（プロバイダー選択を含む）
 * @param {object} options
 * @param {string} options.text - 読み上げるテキスト
 * @param {string} options.outputPath - 出力ファイルパス
 * @param {number} options.durationMs - 音声の長さ（ミリ秒、dummy用）
 * @param {string} options.provider - プロバイダー名
 * @param {object} options.config - プロバイダー固有の設定
 * @returns {Promise<{ success: boolean, path: string, cached: boolean, provider: string }>}
 */
export async function generateAudio(options) {
  const provider = await resolveProvider(options.provider);

  try {
    const result = await provider.generate(options);
    return {
      ...result,
      provider: provider.name,
    };
  } catch (error) {
    // エラー時は dummy にフォールバック
    if (provider.name !== "dummy") {
      console.warn(`[TTS] Provider "${provider.name}" failed, falling back to dummy`);
      console.warn(`[TTS] Error: ${error.message}`);
      return await providers.dummy.generate(options);
    }
    throw error;
  }
}

/**
 * 利用可能なプロバイダー一覧を取得
 * @returns {string[]}
 */
export function listProviders() {
  return [...Object.keys(providers), ...Object.keys(lazyProviders)];
}

export default {
  getProvider,
  resolveProvider,
  generateAudio,
  listProviders,
};
