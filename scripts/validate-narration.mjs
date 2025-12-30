#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--structure" && args[i + 1]) {
      result.structure = args[++i];
    } else if (args[i] === "--narration" && args[i + 1]) {
      result.narration = args[++i];
    }
  }
  return result;
}

function extractNarrationIds(content) {
  const ids = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^##\s+(s\d{2,4})\s*$/);
    if (match) {
      ids.push(match[1]);
    }
  }
  return ids;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.structure || !args.narration) {
    console.error(
      "Usage: node scripts/validate-narration.mjs --structure <path> --narration <path>"
    );
    process.exit(2);
  }

  // Read structure.json
  const structureRaw = await fs.readFile(args.structure, "utf8");
  const structure = JSON.parse(structureRaw);
  const structureIds = structure.segments.map((s) => s.id);

  // Read narration.md
  const narrationRaw = await fs.readFile(args.narration, "utf8");
  const narrationIds = extractNarrationIds(narrationRaw);

  let hasError = false;

  // Check for missing IDs (in structure but not in narration)
  const missingIds = structureIds.filter((id) => !narrationIds.includes(id));
  if (missingIds.length > 0) {
    console.error(`❌ Missing in narration.md: ${missingIds.join(", ")}`);
    hasError = true;
  }

  // Check for extra IDs (in narration but not in structure)
  const extraIds = narrationIds.filter((id) => !structureIds.includes(id));
  if (extraIds.length > 0) {
    console.error(`❌ Extra in narration.md (not in structure): ${extraIds.join(", ")}`);
    hasError = true;
  }

  // Check for duplicate IDs in narration
  const seen = new Set();
  const duplicates = [];
  for (const id of narrationIds) {
    if (seen.has(id)) {
      duplicates.push(id);
    }
    seen.add(id);
  }
  if (duplicates.length > 0) {
    console.error(`❌ Duplicate in narration.md: ${duplicates.join(", ")}`);
    hasError = true;
  }

  // Check order matches
  if (!hasError) {
    const orderMatches = structureIds.every((id, i) => narrationIds[i] === id);
    if (!orderMatches) {
      console.error(`❌ Order mismatch between structure.json and narration.md`);
      console.error(`   structure: ${structureIds.join(" → ")}`);
      console.error(`   narration: ${narrationIds.join(" → ")}`);
      hasError = true;
    }
  }

  if (hasError) {
    process.exit(1);
  }

  console.log(`✅ narration.md is consistent with structure.json`);
  console.log(`   Segments: ${structureIds.join(", ")}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
