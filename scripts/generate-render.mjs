#!/usr/bin/env node
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";
import path from "node:path";

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--structure" && args[i + 1]) {
      result.structure = args[++i];
    } else if (args[i] === "--narration" && args[i + 1]) {
      result.narration = args[++i];
    } else if (args[i] === "--out" && args[i + 1]) {
      result.out = args[++i];
    }
  }
  return result;
}

function parseNarration(content) {
  const segments = {};
  const lines = content.split("\n");
  let currentId = null;
  let currentLines = [];

  for (const line of lines) {
    const match = line.match(/^##\s+(s\d{2,4})\s*$/);
    if (match) {
      if (currentId && currentLines.length > 0) {
        segments[currentId] = currentLines
          .filter((l) => !l.startsWith("[話者:") && l.trim().length > 0)
          .join("\n")
          .trim();
      }
      currentId = match[1];
      currentLines = [];
    } else if (currentId) {
      currentLines.push(line);
    }
  }

  if (currentId && currentLines.length > 0) {
    segments[currentId] = currentLines
      .filter((l) => !l.startsWith("[話者:") && l.trim().length > 0)
      .join("\n")
      .trim();
  }

  return segments;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.structure || !args.narration || !args.out) {
    console.error(
      "Usage: node scripts/generate-render.mjs --structure <path> --narration <path> --out <path>"
    );
    process.exit(2);
  }

  // Read inputs
  const structureRaw = await fs.readFile(args.structure, "utf8");
  const structure = JSON.parse(structureRaw);

  const narrationRaw = await fs.readFile(args.narration, "utf8");
  const narrationSegments = parseNarration(narrationRaw);

  // Build render.json
  const render = {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    render_mode: "hybrid",
    output: {
      format: "mp4",
      width: 1080,
      height: 1920,
      fps: 30,
    },
    segments: [],
  };

  for (const seg of structure.segments) {
    const script = narrationSegments[seg.id] || "";
    if (!narrationSegments[seg.id]) {
      console.warn(`⚠️  Warning: No narration found for segment ${seg.id}`);
    }

    render.segments.push({
      id: seg.id,
      duration_ms: seg.end_ms - seg.start_ms,
      video: {
        mode: "reuse_original",
      },
      audio: {
        mode: "tts",
        script: script,
      },
    });
  }

  // Write output
  await fs.writeFile(args.out, JSON.stringify(render, null, 2) + "\n", "utf8");
  console.log(`✅ Generated: ${args.out}`);

  // Self-validate
  const scriptDir = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname));
  const validateScript = path.join(scriptDir, "validate-json.mjs");
  const schemaPath = path.join(
    path.dirname(scriptDir),
    "schemas",
    "render.schema.json"
  );

  const result = spawnSync("node", [validateScript, schemaPath, args.out], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error("❌ Validation failed. Please fix the output.");
    process.exit(1);
  }

  console.log("✅ Validation passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
