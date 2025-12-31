/**
 * Lipsync Provider Router
 *
 * プロバイダー名に応じて適切な実装を返す
 *
 * Usage:
 *   import { getLipsyncProvider } from './providers/lipsync/index.mjs';
 *   const provider = getLipsyncProvider('dummy');
 *   await provider.generate({ facePath, audioPath, outPath, ... });
 */

import { createDummyProvider } from './dummy.mjs';

// 利用可能なプロバイダー
const PROVIDERS = {
  dummy: createDummyProvider,
  // http: createHttpProvider,  // Task 86 で追加予定
  // local: createLocalCliProvider,  // Task 86 で追加予定
};

/**
 * プロバイダーを取得
 * @param {string} name - プロバイダー名
 * @returns {object} プロバイダーインスタンス
 */
export function getLipsyncProvider(name = 'dummy') {
  const providerName = name || process.env.VIDEOJSON_LIPSYNC_PROVIDER || 'dummy';

  const createProvider = PROVIDERS[providerName];
  if (!createProvider) {
    const available = Object.keys(PROVIDERS).join(', ');
    throw new Error(
      `Unknown lipsync provider: "${providerName}"\n` +
      `Available providers: ${available}\n` +
      `Set VIDEOJSON_LIPSYNC_PROVIDER environment variable or use --lipsync-provider option.`
    );
  }

  return createProvider();
}

/**
 * 利用可能なプロバイダー一覧を取得
 * @returns {string[]}
 */
export function getAvailableProviders() {
  return Object.keys(PROVIDERS);
}

/**
 * プロバイダーが利用可能か確認
 * @param {string} name
 * @returns {boolean}
 */
export function isProviderAvailable(name) {
  return name in PROVIDERS;
}

export default { getLipsyncProvider, getAvailableProviders, isProviderAvailable };
