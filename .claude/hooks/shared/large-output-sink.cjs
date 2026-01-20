#!/usr/bin/env node
/**
 * TAISUN Large Output Sink
 *
 * 仕様: docs/taisun_master_guard_spec.yaml
 * - 大出力は memory_add へ退避
 * - Issue/Runlog は要約 + refId のみ
 * - 閾値: 6000文字 or 120行
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SINK_DIR = path.resolve(__dirname, '../../artifacts/output_sink');
const THRESHOLD_CHARS = 6000;
const THRESHOLD_LINES = 120;

/**
 * 出力が閾値を超えているか判定
 */
function isLargeOutput(output) {
  if (!output) return false;
  const text = String(output);
  const charCount = text.length;
  const lineCount = text.split('\n').length;
  return charCount > THRESHOLD_CHARS || lineCount > THRESHOLD_LINES;
}

/**
 * 大出力を退避し、refIdを返す
 */
function sinkLargeOutput(output, metadata = {}) {
  if (!fs.existsSync(SINK_DIR)) {
    fs.mkdirSync(SINK_DIR, { recursive: true });
  }

  const text = String(output);
  const refId = crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}_${refId}.txt`;
  const filePath = path.join(SINK_DIR, filename);

  // メタデータ付きで保存
  const content = `# TAISUN Large Output Sink
# RefId: ${refId}
# Timestamp: ${new Date().toISOString()}
# Chars: ${text.length}
# Lines: ${text.split('\n').length}
# Metadata: ${JSON.stringify(metadata)}
# ---

${text}`;

  fs.writeFileSync(filePath, content, 'utf8');

  return {
    refId,
    filePath,
    summary: generateSummary(text),
    charCount: text.length,
    lineCount: text.split('\n').length
  };
}

/**
 * 出力の要約を生成
 */
function generateSummary(text, maxLines = 10) {
  const lines = text.split('\n');
  const totalLines = lines.length;

  if (totalLines <= maxLines) {
    return text;
  }

  const head = lines.slice(0, Math.floor(maxLines / 2)).join('\n');
  const tail = lines.slice(-Math.floor(maxLines / 2)).join('\n');

  return `${head}\n...(${totalLines - maxLines} lines omitted)...\n${tail}`;
}

/**
 * 出力を処理（必要に応じて退避）
 */
function processOutput(output, metadata = {}) {
  if (isLargeOutput(output)) {
    const result = sinkLargeOutput(output, metadata);
    return {
      type: 'sunk',
      refId: result.refId,
      summary: result.summary,
      message: `[TAISUN] 大出力を退避しました (refId: ${result.refId}, ${result.charCount}文字, ${result.lineCount}行)`
    };
  }

  return {
    type: 'inline',
    content: output
  };
}

module.exports = {
  isLargeOutput,
  sinkLargeOutput,
  generateSummary,
  processOutput,
  THRESHOLD_CHARS,
  THRESHOLD_LINES
};
