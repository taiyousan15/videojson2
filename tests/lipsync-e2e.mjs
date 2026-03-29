#!/usr/bin/env node
/**
 * lipsync-e2e.mjs
 * Lipsync機能のE2Eテスト
 *
 * テスト項目:
 * 1. lipsync render.json のスキーマバリデーション
 * 2. consent ありのポリシーバリデーション（成功）
 * 3. consent なしのポリシーバリデーション（失敗）
 * 4. materialize-render での lipsync 生成
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf-8",
    ...options,
  });
  return {
    code: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   ${err.message}`);
    return false;
  }
}

function assertEqual(actual, expected, message = "") {
  if (actual !== expected) {
    throw new Error(`${message}: Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, message = "") {
  if (!value) {
    throw new Error(`${message}: Expected true, got ${value}`);
  }
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                   Lipsync E2E Tests                            ║
╚════════════════════════════════════════════════════════════════╝
`);

  const results = [];

  // Test 1: Schema validation (valid)
  results.push(
    test("Schema validation - valid lipsync render.json", () => {
      const result = run("node", [
        "scripts/validate-json.mjs",
        "schemas/render.schema.json",
        "examples/lipsync/render.json",
      ]);
      assertEqual(result.code, 0, "Schema validation should pass");
    })
  );

  // Test 2: Policy validation with consent (should pass)
  results.push(
    test("Policy validation - with consent (should pass)", () => {
      const result = run("node", [
        "scripts/validate-policy.mjs",
        "--render",
        "examples/lipsync/render.json",
      ]);
      assertEqual(result.code, 0, "Policy validation should pass with consent");
      assertTrue(
        result.stdout.includes("Lipsync consent verified"),
        "Should verify consent"
      );
    })
  );

  // Test 3: Policy validation without consent (should fail)
  results.push(
    test("Policy validation - without consent (should fail)", () => {
      // Create a temporary render.json without consent
      const renderNoConsent = {
        schema_version: "1.0.0",
        segments: [
          {
            id: "s01",
            duration_ms: 3000,
            video: {
              mode: "lipsync",
              lipsync: {
                face_asset_id: "face_no_consent",
              },
            },
            audio: { mode: "uploaded", asset_id: "audio" },
          },
        ],
        assets: [
          {
            id: "face_no_consent",
            type: "image",
            uri: "assets/face.png",
            // No meta.consent!
          },
          { id: "audio", type: "audio", uri: "assets/audio.mp3" },
        ],
      };

      const tempPath = path.join(ROOT, ".tmp", "test_no_consent.json");
      if (!fs.existsSync(path.dirname(tempPath))) {
        fs.mkdirSync(path.dirname(tempPath), { recursive: true });
      }
      fs.writeFileSync(tempPath, JSON.stringify(renderNoConsent, null, 2));

      const result = run("node", [
        "scripts/validate-policy.mjs",
        "--render",
        tempPath,
      ]);
      assertEqual(result.code, 1, "Policy validation should fail without consent");
      assertTrue(
        result.stdout.includes("requires meta.consent=true"),
        "Should report missing consent"
      );

      fs.unlinkSync(tempPath);
    })
  );

  // Test 4: Materialize with lipsync
  results.push(
    test("Materialize render with lipsync provider", () => {
      const outPath = path.join(ROOT, "examples/lipsync/render.materialized.json");

      // Clean up previous run
      if (fs.existsSync(outPath)) {
        fs.unlinkSync(outPath);
      }

      const result = run("node", [
        "scripts/materialize-render.mjs",
        "--render",
        "examples/lipsync/render.json",
        "--out",
        outPath,
        "--lipsync-provider",
        "dummy",
      ]);

      assertEqual(result.code, 0, "Materialize should succeed");
      assertTrue(fs.existsSync(outPath), "Output file should exist");

      // Verify content
      const materialized = JSON.parse(fs.readFileSync(outPath, "utf-8"));
      assertTrue(
        materialized._lipsync?.used === true,
        "_lipsync.used should be true"
      );
      assertTrue(
        materialized.segments[0].video.mode === "reuse_original",
        "Lipsync segment should be converted to reuse_original"
      );
      assertTrue(
        materialized.segments[0].video._original_mode === "lipsync",
        "Original mode should be preserved"
      );
    })
  );

  // Test 5: Check generated video exists
  results.push(
    test("Generated lipsync video exists", () => {
      const videoPath = path.join(
        ROOT,
        "examples/lipsync/.tmp/video/s01_lipsync.mp4"
      );
      assertTrue(fs.existsSync(videoPath), "Generated video should exist");

      const stats = fs.statSync(videoPath);
      assertTrue(stats.size > 0, "Generated video should not be empty");
    })
  );

  // Summary
  const passed = results.filter((r) => r).length;
  const total = results.length;

  console.log(`
━━━ Summary ━━━
  Passed: ${passed}/${total}
`);

  if (passed !== total) {
    process.exit(1);
  }

  console.log("✅ All lipsync E2E tests passed!");
  process.exit(0);
}

main().catch((err) => {
  console.error("[ERROR]", err);
  process.exit(1);
});
