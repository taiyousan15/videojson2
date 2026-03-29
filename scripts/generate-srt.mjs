#!/usr/bin/env node
/**
 * generate-srt.mjs
 * render.materialized.json から SRT 字幕ファイルを生成する
 *
 * 使い方:
 *   node scripts/generate-srt.mjs --render render.materialized.json --output subtitles.srt
 */

import fs from "fs";
import path from "path";

function parseArgs(args) {
  const result = {
    render: null,
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--render" && args[i + 1]) {
      result.render = args[++i];
    } else if (args[i] === "--output" && args[i + 1]) {
      result.output = args[++i];
    }
  }

  return result;
}

/**
 * ミリ秒を SRT 形式の時間文字列に変換
 * @param {number} ms - ミリ秒
 * @returns {string} - "HH:MM:SS,mmm" 形式
 */
function msToSrtTime(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0") +
    "," +
    String(milliseconds).padStart(3, "0")
  );
}

/**
 * render.materialized.json から SRT を生成
 * @param {object} renderJson - render.materialized.json
 * @returns {string} - SRT 形式の文字列
 */
export function generateSrt(renderJson) {
  const lines = [];
  let index = 1;
  let currentTimeMs = 0;

  for (const segment of renderJson.segments || []) {
    // script を取得（TTS処理後は _original_script に保存されている場合がある）
    const script =
      segment.audio?._original_script ||
      segment.audio?.script ||
      null;

    if (script) {
      const startTime = msToSrtTime(currentTimeMs);
      const endTime = msToSrtTime(currentTimeMs + segment.duration_ms);

      lines.push(String(index));
      lines.push(`${startTime} --> ${endTime}`);
      lines.push(script.trim());
      lines.push(""); // 空行

      index++;
    }

    currentTimeMs += segment.duration_ms;
  }

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.render) {
    console.log("Usage: node scripts/generate-srt.mjs --render <path> --output <path>");
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
    console.error(`Error parsing render file: ${error.message}`);
    process.exit(1);
  }

  const srt = generateSrt(renderJson);

  const outputPath = args.output
    ? path.resolve(args.output)
    : renderPath.replace(/\.json$/, ".srt");

  fs.writeFileSync(outputPath, srt);
  console.log(`SRT generated: ${outputPath}`);

  // 字幕数を表示
  const subtitleCount = (srt.match(/^\d+$/gm) || []).length;
  console.log(`Subtitles: ${subtitleCount}`);
}

// CLI 実行時のみ main を呼ぶ
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default {
  generateSrt,
  msToSrtTime,
};
