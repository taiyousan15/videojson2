#!/usr/bin/env node
/**
 * validate-semantic.mjs
 * structure.json と render.json の整合性をセマンティックに検証する
 *
 * チェック項目:
 * - セグメント ID の一致
 * - セグメント数の一致
 * - セグメント順序の一致
 * - duration_ms の妥当性（許容誤差内）
 * - asset_id の存在確認
 *
 * 使い方:
 *   node scripts/validate-semantic.mjs --structure structure.json --render render.json
 */

import fs from "fs";
import path from "path";

function parseArgs(args) {
  const result = {
    structure: null,
    render: null,
    tolerance: 1000, // duration_ms の許容誤差（ミリ秒）
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--structure" && args[i + 1]) {
      result.structure = args[++i];
    } else if (args[i] === "--render" && args[i + 1]) {
      result.render = args[++i];
    } else if (args[i] === "--tolerance" && args[i + 1]) {
      result.tolerance = parseInt(args[++i], 10);
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/validate-semantic.mjs --structure <path> --render <path>

Options:
  --structure <path>  Path to structure.json (required)
  --render <path>     Path to render.json (required)
  --tolerance <ms>    Duration tolerance in milliseconds (default: 1000)

Example:
  node scripts/validate-semantic.mjs --structure examples/smoke/structure.json --render examples/smoke/render.json
`);
}

function validateSemantics(structureJson, renderJson, tolerance) {
  const errors = [];
  const warnings = [];

  // セグメント配列を取得
  const structureSegments = structureJson.segments || [];
  const renderSegments = renderJson.segments || [];

  // 1. セグメント数の一致
  if (structureSegments.length !== renderSegments.length) {
    errors.push(
      `Segment count mismatch: structure has ${structureSegments.length}, render has ${renderSegments.length}`
    );
  }

  // 2. セグメント ID の抽出
  const structureIds = structureSegments.map((s) => s.id);
  const renderIds = renderSegments.map((s) => s.id);

  // 3. ID の一致チェック
  const missingInRender = structureIds.filter((id) => !renderIds.includes(id));
  const extraInRender = renderIds.filter((id) => !structureIds.includes(id));

  if (missingInRender.length > 0) {
    errors.push(`Segments in structure but not in render: ${missingInRender.join(", ")}`);
  }
  if (extraInRender.length > 0) {
    errors.push(`Segments in render but not in structure: ${extraInRender.join(", ")}`);
  }

  // 4. 順序の一致チェック
  const minLength = Math.min(structureIds.length, renderIds.length);
  for (let i = 0; i < minLength; i++) {
    if (structureIds[i] !== renderIds[i]) {
      errors.push(`Segment order mismatch at position ${i}: structure has "${structureIds[i]}", render has "${renderIds[i]}"`);
      break; // 最初の不一致で止める
    }
  }

  // 5. duration_ms のチェック（一致するセグメントのみ）
  for (const renderSeg of renderSegments) {
    const structureSeg = structureSegments.find((s) => s.id === renderSeg.id);
    if (!structureSeg) continue;

    const structureDuration = structureSeg.end_ms - structureSeg.start_ms;
    const renderDuration = renderSeg.duration_ms;

    const diff = Math.abs(structureDuration - renderDuration);
    if (diff > tolerance) {
      warnings.push(
        `Duration mismatch for ${renderSeg.id}: structure=${structureDuration}ms, render=${renderDuration}ms (diff=${diff}ms > tolerance=${tolerance}ms)`
      );
    }
  }

  // 6. asset_id の存在確認
  const assetIds = (renderJson.assets || []).map((a) => a.id);

  for (const segment of renderSegments) {
    // video.source.asset_id
    if (segment.video?.source?.asset_id) {
      if (!assetIds.includes(segment.video.source.asset_id)) {
        errors.push(
          `Segment ${segment.id}: video asset_id "${segment.video.source.asset_id}" not found in assets[]`
        );
      }
    }

    // audio.asset_id
    if (segment.audio?.asset_id) {
      if (!assetIds.includes(segment.audio.asset_id)) {
        errors.push(
          `Segment ${segment.id}: audio asset_id "${segment.audio.asset_id}" not found in assets[]`
        );
      }
    }

    // lipsync.target_face_image_asset_id
    if (segment.audio?.lipsync?.target_face_image_asset_id) {
      if (!assetIds.includes(segment.audio.lipsync.target_face_image_asset_id)) {
        errors.push(
          `Segment ${segment.id}: lipsync asset_id "${segment.audio.lipsync.target_face_image_asset_id}" not found in assets[]`
        );
      }
    }
  }

  // 7. providers 参照の整合性
  if (renderJson.providers?.lipsync?.target_face_image_asset_id) {
    const assetId = renderJson.providers.lipsync.target_face_image_asset_id;
    if (!assetIds.includes(assetId)) {
      errors.push(`providers.lipsync.target_face_image_asset_id "${assetId}" not found in assets[]`);
    }
  }

  return { errors, warnings };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.structure || !args.render) {
    console.error("Error: --structure and --render are required\n");
    showUsage();
    process.exit(1);
  }

  const structurePath = path.resolve(args.structure);
  const renderPath = path.resolve(args.render);

  if (!fs.existsSync(structurePath)) {
    console.error(`Error: structure file not found: ${structurePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(renderPath)) {
    console.error(`Error: render file not found: ${renderPath}`);
    process.exit(1);
  }

  let structureJson, renderJson;
  try {
    structureJson = JSON.parse(fs.readFileSync(structurePath, "utf-8"));
  } catch (error) {
    console.error(`Error parsing structure.json: ${error.message}`);
    process.exit(1);
  }
  try {
    renderJson = JSON.parse(fs.readFileSync(renderPath, "utf-8"));
  } catch (error) {
    console.error(`Error parsing render.json: ${error.message}`);
    process.exit(1);
  }

  const { errors, warnings } = validateSemantics(structureJson, renderJson, args.tolerance);

  // 結果出力
  if (warnings.length > 0) {
    console.log("⚠️  Warnings:");
    for (const w of warnings) {
      console.log(`   - ${w}`);
    }
    console.log();
  }

  if (errors.length > 0) {
    console.log("❌ Semantic validation errors:");
    for (const e of errors) {
      console.log(`   - ${e}`);
    }
    process.exit(1);
  }

  console.log("✅ Semantic validation passed");
  console.log(`   Structure segments: ${structureJson.segments?.length || 0}`);
  console.log(`   Render segments: ${renderJson.segments?.length || 0}`);
}

main();
