#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import Ajv from "ajv";
import addFormats from "ajv-formats";

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function formatErrors(errors) {
  return (errors ?? []).map((e) => {
    const where = e.instancePath && e.instancePath.length > 0 ? e.instancePath : "/";
    return `- ${where} ${e.message ?? ""}`.trim();
  });
}

async function main() {
  const [schemaPath, dataPath] = process.argv.slice(2);

  if (!schemaPath || !dataPath) {
    console.error("Usage: node scripts/validate-json.mjs <schema.json> <data.json>");
    process.exit(2);
  }

  const schema = await readJson(schemaPath);
  const data = await readJson(dataPath);

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const validate = ajv.compile(schema);
  const ok = validate(data);

  if (ok) {
    console.log(`✅ Valid JSON: ${dataPath}`);
    process.exit(0);
  }

  console.error(`❌ Invalid JSON: ${dataPath}`);
  for (const line of formatErrors(validate.errors)) console.error(line);

  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
