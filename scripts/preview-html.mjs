#!/usr/bin/env node
/**
 * preview-html.mjs
 * structure.json と narration.md からプレビューHTMLを生成する
 *
 * 使い方:
 *   node scripts/preview-html.mjs --structure structure.json --narration narration.md --out preview.html
 *
 * 機能:
 *   - セグメントのタイムライン表示
 *   - 各セグメントの内容と台本の並列表示
 *   - レンダリング設定のサマリー
 */

import fs from "fs";
import path from "path";

function parseArgs(args) {
  const result = {
    structure: null,
    narration: null,
    render: null,
    out: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--structure" && args[i + 1]) {
      result.structure = args[++i];
    } else if (args[i] === "--narration" && args[i + 1]) {
      result.narration = args[++i];
    } else if (args[i] === "--render" && args[i + 1]) {
      result.render = args[++i];
    } else if (args[i] === "--out" && args[i + 1]) {
      result.out = args[++i];
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/preview-html.mjs --structure <structure.json> [options]

Options:
  --structure <path>   structure.json のパス（必須）
  --narration <path>   narration.md のパス（オプション）
  --render <path>      render.json のパス（オプション）
  --out <path>         出力HTMLファイル（デフォルト: preview.html）

Examples:
  node scripts/preview-html.mjs --structure myproject/structure.json --out preview.html
  node scripts/preview-html.mjs --structure s.json --narration n.md --render r.json --out full-preview.html
`);
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function parseNarration(content) {
  const segments = {};
  const lines = content.split("\n");
  let currentId = null;
  let currentLines = [];

  for (const line of lines) {
    const headerMatch = line.match(/^##? (s\d+)/);
    if (headerMatch) {
      if (currentId) {
        segments[currentId] = currentLines.join("\n").trim();
      }
      currentId = headerMatch[1];
      currentLines = [];
    } else if (currentId) {
      currentLines.push(line);
    }
  }

  if (currentId) {
    segments[currentId] = currentLines.join("\n").trim();
  }

  return segments;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateHtml(structure, narrationContent, renderJson) {
  const narrationSegments = narrationContent ? parseNarration(narrationContent) : {};
  const totalDuration = structure.video?.duration_ms ||
    Math.max(...structure.segments.map(s => s.end_ms || 0));

  const segmentColors = {
    intro: "#4CAF50",
    main: "#2196F3",
    explanation: "#9C27B0",
    example: "#FF9800",
    summary: "#00BCD4",
    outro: "#F44336",
    default: "#607D8B",
  };

  const segmentRows = structure.segments.map((seg, idx) => {
    const color = segmentColors[seg.type] || segmentColors.default;
    const duration = (seg.end_ms - seg.start_ms) / 1000;
    const narration = narrationSegments[seg.id] || "<em>(台本なし)</em>";
    const widthPercent = ((seg.end_ms - seg.start_ms) / totalDuration) * 100;
    const leftPercent = (seg.start_ms / totalDuration) * 100;

    return `
      <tr class="segment-row" data-id="${seg.id}">
        <td class="seg-id">${seg.id}</td>
        <td class="seg-type"><span class="type-badge" style="background:${color}">${seg.type}</span></td>
        <td class="seg-time">${formatTime(seg.start_ms)} - ${formatTime(seg.end_ms)}</td>
        <td class="seg-duration">${duration.toFixed(1)}s</td>
        <td class="seg-content">${escapeHtml(seg.content || "")}</td>
      </tr>
      <tr class="narration-row">
        <td colspan="5" class="narration-cell">
          <div class="narration-content">${escapeHtml(narration).replace(/\n/g, "<br>")}</div>
        </td>
      </tr>
    `;
  }).join("");

  const timelineBlocks = structure.segments.map((seg) => {
    const color = segmentColors[seg.type] || segmentColors.default;
    const widthPercent = ((seg.end_ms - seg.start_ms) / totalDuration) * 100;
    const leftPercent = (seg.start_ms / totalDuration) * 100;
    return `<div class="timeline-block" style="left:${leftPercent}%;width:${widthPercent}%;background:${color}" title="${seg.id}: ${seg.type}"></div>`;
  }).join("");

  const renderInfo = renderJson ? `
    <div class="render-info">
      <h3>Render Settings</h3>
      <ul>
        <li><strong>Resolution:</strong> ${renderJson.resolution?.width || "?"}x${renderJson.resolution?.height || "?"}</li>
        <li><strong>FPS:</strong> ${renderJson.fps || "?"}</li>
        <li><strong>Audio:</strong> ${renderJson.audio?.mode || "?"}</li>
      </ul>
    </div>
  ` : "";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VideoJSON Preview - ${escapeHtml(structure.video?.title || "Untitled")}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
      color: #333;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { margin-bottom: 5px; }
    .meta { color: #666; margin-bottom: 20px; }
    .card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h2 { margin-top: 0; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .timeline {
      position: relative;
      height: 40px;
      background: #ddd;
      border-radius: 4px;
      margin: 10px 0 30px;
      overflow: hidden;
    }
    .timeline-block {
      position: absolute;
      height: 100%;
      opacity: 0.9;
      transition: opacity 0.2s;
      cursor: pointer;
    }
    .timeline-block:hover { opacity: 1; }
    .time-labels {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #666;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #fafafa; font-weight: 600; }
    .seg-id { width: 60px; font-family: monospace; }
    .seg-type { width: 100px; }
    .seg-time { width: 120px; font-family: monospace; }
    .seg-duration { width: 70px; }
    .type-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      color: white;
      font-size: 12px;
    }
    .narration-row td { background: #fafafa; }
    .narration-cell { padding: 15px 20px; }
    .narration-content {
      white-space: pre-wrap;
      font-size: 14px;
      color: #555;
      border-left: 3px solid #2196F3;
      padding-left: 15px;
    }
    .render-info ul { list-style: none; padding: 0; }
    .render-info li { padding: 5px 0; }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-top: 10px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
    }
    .legend-color {
      width: 16px;
      height: 16px;
      border-radius: 3px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    .summary-item {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 6px;
    }
    .summary-item strong { display: block; font-size: 24px; color: #2196F3; }
    .summary-item span { font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(structure.video?.title || "Untitled")}</h1>
    <p class="meta">
      Language: ${structure.video?.language || "?"} |
      Source: ${structure.video?.source_type || "?"} |
      Generated: ${structure.generated_at || "?"}
    </p>

    <div class="card">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="summary-item">
          <strong>${structure.segments.length}</strong>
          <span>Segments</span>
        </div>
        <div class="summary-item">
          <strong>${formatTime(totalDuration)}</strong>
          <span>Total Duration</span>
        </div>
        <div class="summary-item">
          <strong>${Object.keys(narrationSegments).length}</strong>
          <span>Narration Segments</span>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Timeline</h2>
      <div class="timeline">${timelineBlocks}</div>
      <div class="time-labels">
        <span>0:00</span>
        <span>${formatTime(totalDuration)}</span>
      </div>
      <div class="legend">
        <div class="legend-item"><div class="legend-color" style="background:#4CAF50"></div>intro</div>
        <div class="legend-item"><div class="legend-color" style="background:#2196F3"></div>main</div>
        <div class="legend-item"><div class="legend-color" style="background:#9C27B0"></div>explanation</div>
        <div class="legend-item"><div class="legend-color" style="background:#FF9800"></div>example</div>
        <div class="legend-item"><div class="legend-color" style="background:#00BCD4"></div>summary</div>
        <div class="legend-item"><div class="legend-color" style="background:#F44336"></div>outro</div>
      </div>
    </div>

    <div class="card">
      <h2>Segments & Narration</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Time</th>
            <th>Duration</th>
            <th>Content</th>
          </tr>
        </thead>
        <tbody>
          ${segmentRows}
        </tbody>
      </table>
    </div>

    ${renderInfo}

    <footer style="text-align:center;color:#999;padding:20px;font-size:12px">
      Generated by VideoJSON Preview Tool
    </footer>
  </div>
</body>
</html>`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.structure) {
    showUsage();
    process.exit(1);
  }

  // Read structure.json
  if (!fs.existsSync(options.structure)) {
    console.error(`[ERROR] structure.json が見つかりません: ${options.structure}`);
    process.exit(1);
  }
  const structure = JSON.parse(fs.readFileSync(options.structure, "utf8"));
  console.log(`[INFO] structure.json を読み込みました: ${structure.segments.length} segments`);

  // Read narration.md (optional)
  let narrationContent = null;
  if (options.narration && fs.existsSync(options.narration)) {
    narrationContent = fs.readFileSync(options.narration, "utf8");
    console.log(`[INFO] narration.md を読み込みました`);
  }

  // Read render.json (optional)
  let renderJson = null;
  if (options.render && fs.existsSync(options.render)) {
    renderJson = JSON.parse(fs.readFileSync(options.render, "utf8"));
    console.log(`[INFO] render.json を読み込みました`);
  }

  // Generate HTML
  const html = generateHtml(structure, narrationContent, renderJson);

  // Output
  const outPath = options.out || "preview.html";
  const outDir = path.dirname(outPath);
  if (outDir && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(outPath, html);
  console.log(`[SUCCESS] プレビューHTMLを生成しました: ${outPath}`);
}

main().catch((err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});
