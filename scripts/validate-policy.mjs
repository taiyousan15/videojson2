#!/usr/bin/env node
/**
 * validate-policy.mjs
 * render.json の許諾ポリシーを検証する
 *
 * チェック項目:
 * - lipsync を使用するセグメントの対象アセットに meta.consent=true があること
 * - voice_conversion を使用するセグメントの対象アセットに meta.consent=true があること
 *
 * 使い方:
 *   node scripts/validate-policy.mjs --render render.json
 */

import fs from "fs";
import path from "path";

function parseArgs(args) {
  const result = {
    render: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--render" && args[i + 1]) {
      result.render = args[++i];
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/validate-policy.mjs --render <path>

Options:
  --render <path>  Path to render.json (required)

Example:
  node scripts/validate-policy.mjs --render examples/smoke/render.json
`);
}

/**
 * アセットIDからアセット情報を取得
 */
function getAsset(renderJson, assetId) {
  return (renderJson.assets || []).find((a) => a.id === assetId);
}

/**
 * アセットがconsent=trueを持っているか確認
 */
function hasConsent(asset) {
  return asset?.meta?.consent === true;
}

/**
 * ポリシー検証
 */
function validatePolicy(renderJson) {
  const errors = [];
  const warnings = [];

  const segments = renderJson.segments || [];

  for (const segment of segments) {
    // 1. lipsync のチェック
    if (segment.audio?.lipsync?.enabled !== false) {
      // lipsyncがセグメントレベルで有効な場合
      const lipsyncConfig = segment.audio?.lipsync;

      if (lipsyncConfig?.target_face_image_asset_id) {
        const assetId = lipsyncConfig.target_face_image_asset_id;
        const asset = getAsset(renderJson, assetId);

        if (!asset) {
          errors.push(
            `Segment "${segment.id}": lipsync target_face_image_asset_id "${assetId}" not found in assets[]`
          );
        } else if (!hasConsent(asset)) {
          errors.push(
            `Segment "${segment.id}": Asset "${assetId}" used for lipsync but missing meta.consent=true`
          );
        }
      }
    }

    // 2. voice_conversion のチェック
    if (segment.audio?.voice_conversion?.enabled !== false) {
      const vcConfig = segment.audio?.voice_conversion;

      if (vcConfig?.source_voice_asset_id) {
        const assetId = vcConfig.source_voice_asset_id;
        const asset = getAsset(renderJson, assetId);

        if (!asset) {
          errors.push(
            `Segment "${segment.id}": voice_conversion source_voice_asset_id "${assetId}" not found in assets[]`
          );
        } else if (!hasConsent(asset)) {
          errors.push(
            `Segment "${segment.id}": Asset "${assetId}" used for voice_conversion but missing meta.consent=true`
          );
        }
      }

      if (vcConfig?.target_voice_asset_id) {
        const assetId = vcConfig.target_voice_asset_id;
        const asset = getAsset(renderJson, assetId);

        if (!asset) {
          errors.push(
            `Segment "${segment.id}": voice_conversion target_voice_asset_id "${assetId}" not found in assets[]`
          );
        } else if (!hasConsent(asset)) {
          errors.push(
            `Segment "${segment.id}": Asset "${assetId}" used for voice_conversion but missing meta.consent=true`
          );
        }
      }
    }
  }

  // 3. providers レベルの lipsync チェック
  if (renderJson.providers?.lipsync?.target_face_image_asset_id) {
    const assetId = renderJson.providers.lipsync.target_face_image_asset_id;
    const asset = getAsset(renderJson, assetId);

    if (!asset) {
      errors.push(
        `providers.lipsync.target_face_image_asset_id "${assetId}" not found in assets[]`
      );
    } else if (!hasConsent(asset)) {
      errors.push(
        `Asset "${assetId}" used for providers.lipsync but missing meta.consent=true`
      );
    }
  }

  // 4. providers レベルの voice_conversion チェック
  if (renderJson.providers?.voice_conversion) {
    const vcConfig = renderJson.providers.voice_conversion;

    if (vcConfig.source_voice_asset_id) {
      const assetId = vcConfig.source_voice_asset_id;
      const asset = getAsset(renderJson, assetId);

      if (!asset) {
        errors.push(
          `providers.voice_conversion.source_voice_asset_id "${assetId}" not found in assets[]`
        );
      } else if (!hasConsent(asset)) {
        errors.push(
          `Asset "${assetId}" used for providers.voice_conversion but missing meta.consent=true`
        );
      }
    }

    if (vcConfig.target_voice_asset_id) {
      const assetId = vcConfig.target_voice_asset_id;
      const asset = getAsset(renderJson, assetId);

      if (!asset) {
        errors.push(
          `providers.voice_conversion.target_voice_asset_id "${assetId}" not found in assets[]`
        );
      } else if (!hasConsent(asset)) {
        errors.push(
          `Asset "${assetId}" used for providers.voice_conversion but missing meta.consent=true`
        );
      }
    }
  }

  return { errors, warnings };
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

  let renderJson;
  try {
    renderJson = JSON.parse(fs.readFileSync(renderPath, "utf-8"));
  } catch (error) {
    console.error(`Error parsing render.json: ${error.message}`);
    process.exit(1);
  }

  const { errors, warnings } = validatePolicy(renderJson);

  // 結果出力
  if (warnings.length > 0) {
    console.log("⚠️  Warnings:");
    for (const w of warnings) {
      console.log(`   - ${w}`);
    }
    console.log();
  }

  if (errors.length > 0) {
    console.log("❌ Policy validation errors:");
    for (const e of errors) {
      console.log(`   - ${e}`);
    }
    process.exit(1);
  }

  console.log("✅ Policy validation passed");
  console.log(`   Checked ${renderJson.segments?.length || 0} segments`);
}

main();
