/**
 * resolve-asset.mjs
 * render.json のアセット参照を実ファイルパスに解決するヘルパー
 */

import fs from "fs";
import path from "path";

/**
 * アセットURIを実ファイルパスに解決する
 * @param {string} uri - アセットURI（file://, asset:, 相対パス）
 * @param {string} projectRoot - プロジェクトルートパス
 * @param {string} assetsDir - アセットディレクトリパス（デフォルト: projectRoot/assets）
 * @returns {{ resolved: string, exists: boolean }}
 */
export function resolveAssetUri(uri, projectRoot, assetsDir = null) {
  const effectiveAssetsDir = assetsDir || path.join(projectRoot, "assets");

  // file:// プロトコル
  if (uri.startsWith("file://")) {
    const filePath = uri.slice(7);
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(projectRoot, filePath);
    return {
      resolved,
      exists: fs.existsSync(resolved),
    };
  }

  // asset: プロトコル（asset:video01 → assets/video01.* を検索）
  if (uri.startsWith("asset:")) {
    const assetId = uri.slice(6);
    const resolved = findAssetById(assetId, effectiveAssetsDir);
    return {
      resolved: resolved || path.join(effectiveAssetsDir, assetId),
      exists: resolved !== null,
    };
  }

  // gs:// プロトコル（GCS - 未実装、プレースホルダー）
  if (uri.startsWith("gs://")) {
    return {
      resolved: uri, // そのまま返す（後でGCSクライアントで処理）
      exists: false, // ローカルには存在しない
      isRemote: true,
    };
  }

  // 相対パス
  const resolved = path.resolve(projectRoot, uri);
  return {
    resolved,
    exists: fs.existsSync(resolved),
  };
}

/**
 * アセットIDからファイルを検索（拡張子を自動検出）
 * @param {string} assetId - アセットID
 * @param {string} assetsDir - アセットディレクトリ
 * @returns {string|null} - 見つかったファイルパス、なければnull
 */
export function findAssetById(assetId, assetsDir) {
  if (!fs.existsSync(assetsDir)) {
    return null;
  }

  const files = fs.readdirSync(assetsDir);
  const extensions = [
    ".mp4",
    ".mov",
    ".webm", // video
    ".mp3",
    ".wav",
    ".m4a",
    ".aac", // audio
    ".jpg",
    ".jpeg",
    ".png",
    ".webp", // image
    ".ttf",
    ".otf",
    ".woff", // font
    ".srt",
    ".vtt", // subtitle
  ];

  // 完全一致を優先
  for (const file of files) {
    const basename = path.basename(file, path.extname(file));
    if (basename === assetId) {
      return path.join(assetsDir, file);
    }
  }

  // 拡張子付きで検索
  for (const ext of extensions) {
    const filename = assetId + ext;
    if (files.includes(filename)) {
      return path.join(assetsDir, filename);
    }
  }

  // サブディレクトリも検索（audio/, video/, image/ など）
  const subdirs = ["audio", "video", "image", "font", "subtitle"];
  for (const subdir of subdirs) {
    const subdirPath = path.join(assetsDir, subdir);
    if (fs.existsSync(subdirPath) && fs.statSync(subdirPath).isDirectory()) {
      const subFiles = fs.readdirSync(subdirPath);
      for (const ext of extensions) {
        const filename = assetId + ext;
        if (subFiles.includes(filename)) {
          return path.join(subdirPath, filename);
        }
      }
      // 拡張子なしでも検索
      for (const file of subFiles) {
        const basename = path.basename(file, path.extname(file));
        if (basename === assetId) {
          return path.join(subdirPath, file);
        }
      }
    }
  }

  return null;
}

/**
 * render.json の全アセットを解決する
 * @param {object} renderJson - render.json オブジェクト
 * @param {string} projectRoot - プロジェクトルートパス
 * @returns {{ resolved: object, errors: string[] }}
 */
export function resolveAllAssets(renderJson, projectRoot) {
  const errors = [];
  const resolved = JSON.parse(JSON.stringify(renderJson)); // deep clone

  // assets 配列の解決
  if (resolved.assets && Array.isArray(resolved.assets)) {
    for (const asset of resolved.assets) {
      if (asset.uri) {
        const result = resolveAssetUri(asset.uri, projectRoot);
        asset._resolved_path = result.resolved;
        asset._exists = result.exists;
        if (!result.exists && !result.isRemote) {
          errors.push(`Asset not found: ${asset.id} (${asset.uri})`);
        }
      }
    }
  }

  // segments 内の asset_id 参照を解決
  if (resolved.segments && Array.isArray(resolved.segments)) {
    for (const segment of resolved.segments) {
      // video.source.asset_id
      if (segment.video?.source?.asset_id) {
        const assetId = segment.video.source.asset_id;
        const asset = resolved.assets?.find((a) => a.id === assetId);
        if (asset) {
          segment.video.source._resolved_path = asset._resolved_path;
        } else {
          errors.push(`Segment ${segment.id}: video asset_id "${assetId}" not found in assets[]`);
        }
      }

      // audio.asset_id
      if (segment.audio?.asset_id) {
        const assetId = segment.audio.asset_id;
        const asset = resolved.assets?.find((a) => a.id === assetId);
        if (asset) {
          segment.audio._resolved_path = asset._resolved_path;
        } else {
          errors.push(`Segment ${segment.id}: audio asset_id "${assetId}" not found in assets[]`);
        }
      }

      // lipsync.target_face_image_asset_id
      if (segment.audio?.lipsync?.target_face_image_asset_id) {
        const assetId = segment.audio.lipsync.target_face_image_asset_id;
        const asset = resolved.assets?.find((a) => a.id === assetId);
        if (asset) {
          segment.audio.lipsync._resolved_path = asset._resolved_path;
        } else {
          errors.push(`Segment ${segment.id}: lipsync asset_id "${assetId}" not found in assets[]`);
        }
      }
    }
  }

  return { resolved, errors };
}

export default {
  resolveAssetUri,
  findAssetById,
  resolveAllAssets,
};
