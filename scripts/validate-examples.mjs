import { spawnSync } from "node:child_process";
import process from "node:process";

const checks = [
  ["schemas/structure.schema.json", "examples/minimal/structure.json"],
  ["schemas/render.schema.json", "examples/minimal/render.json"],
];

let failed = false;

for (const [schema, data] of checks) {
  const res = spawnSync("node", ["scripts/validate-json.mjs", schema, data], {
    stdio: "inherit",
  });
  if (res.status !== 0) failed = true;
}

if (failed) {
  console.error("\n❌ Schema validation failed.");
  process.exit(1);
}

console.log("\n✅ All example JSON files are valid.");
process.exit(0);
