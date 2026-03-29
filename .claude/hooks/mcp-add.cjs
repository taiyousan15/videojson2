#!/usr/bin/env node
/**
 * TAISUN MCP Add Helper
 *
 * 仕様: docs/taisun_master_guard_spec.yaml (mcp_market_underlay)
 * - curated allowlist のみ採用
 * - /mcp-add + 人間承認 でのみ有効化
 * - 常駐ロード禁止（deferred loading）
 *
 * Usage:
 *   node .claude/hooks/mcp-add.cjs <server-id> [--enable|--disable|--list]
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT_DIR = path.resolve(__dirname, '../..');
const MCP_FULL_PATH = path.join(ROOT_DIR, '.mcp.full.json');
const MCP_JSON_PATH = path.join(ROOT_DIR, '.mcp.json');

// Curated allowlist（これ以外のサーバーは追加禁止）
const CURATED_ALLOWLIST = [
  'memory-server',
  'mcp-server-configuration-manager',
  'openspec',
  // 既存の互換サーバー
  'dspy',
  'ollama',
  'comfyui',
  'context-optimizer',
  'ctx',
  'gcloud'
];

/**
 * .mcp.full.json を読み込み
 */
function loadMcpFull() {
  if (!fs.existsSync(MCP_FULL_PATH)) {
    console.error(`エラー: ${MCP_FULL_PATH} が見つかりません`);
    process.exit(1);
  }
  const content = fs.readFileSync(MCP_FULL_PATH, 'utf8');
  return JSON.parse(content);
}

/**
 * .mcp.full.json を保存
 */
function saveMcpFull(data) {
  const content = JSON.stringify(data, null, 2);
  fs.writeFileSync(MCP_FULL_PATH, content, 'utf8');
}

/**
 * サーバー一覧を表示
 */
function listServers() {
  const mcpFull = loadMcpFull();
  const servers = mcpFull.mcpServers || {};

  console.log('\n=== TAISUN MCP Server Catalog ===\n');

  for (const [id, config] of Object.entries(servers)) {
    if (id.startsWith('_')) continue; // コメントフィールドをスキップ

    const enabled = config.enabled !== false;
    const status = enabled ? '✅ enabled' : '❌ disabled';
    const curated = CURATED_ALLOWLIST.includes(id) ? '(curated)' : '(custom)';

    console.log(`  ${id}: ${status} ${curated}`);
    console.log(`    ${config.description || '(no description)'}`);
    if (config.constraints) {
      console.log(`    制約: ${config.constraints.join(', ')}`);
    }
    console.log('');
  }
}

/**
 * 人間承認を求める
 */
async function requestHumanApproval(serverId, action) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log(`\n⚠️  TAISUN MCP Market Underlay - 人間承認が必要です`);
    console.log(`    サーバー: ${serverId}`);
    console.log(`    操作: ${action}`);
    console.log('');

    rl.question('承認しますか？ (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

/**
 * サーバーを有効化
 */
async function enableServer(serverId) {
  if (!CURATED_ALLOWLIST.includes(serverId)) {
    console.error(`エラー: ${serverId} は curated allowlist に含まれていません`);
    console.error(`許可されているサーバー: ${CURATED_ALLOWLIST.join(', ')}`);
    process.exit(1);
  }

  const mcpFull = loadMcpFull();
  const servers = mcpFull.mcpServers || {};

  if (!servers[serverId]) {
    console.error(`エラー: ${serverId} は .mcp.full.json に定義されていません`);
    process.exit(1);
  }

  // 人間承認
  const approved = await requestHumanApproval(serverId, 'enable');
  if (!approved) {
    console.log('キャンセルされました');
    process.exit(0);
  }

  // 有効化
  servers[serverId].enabled = true;
  saveMcpFull(mcpFull);

  console.log(`✅ ${serverId} を有効化しました`);
  console.log(`   注意: Claude Code を再起動して変更を反映してください`);
}

/**
 * サーバーを無効化
 */
async function disableServer(serverId) {
  const mcpFull = loadMcpFull();
  const servers = mcpFull.mcpServers || {};

  if (!servers[serverId]) {
    console.error(`エラー: ${serverId} は .mcp.full.json に定義されていません`);
    process.exit(1);
  }

  // 人間承認
  const approved = await requestHumanApproval(serverId, 'disable');
  if (!approved) {
    console.log('キャンセルされました');
    process.exit(0);
  }

  // 無効化
  servers[serverId].enabled = false;
  saveMcpFull(mcpFull);

  console.log(`❌ ${serverId} を無効化しました`);
}

/**
 * メイン処理
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--list') || args.includes('-l')) {
    listServers();
    return;
  }

  const serverId = args[0];

  if (args.includes('--disable') || args.includes('-d')) {
    await disableServer(serverId);
  } else if (args.includes('--enable') || args.includes('-e')) {
    await enableServer(serverId);
  } else {
    // デフォルトは有効化
    await enableServer(serverId);
  }
}

main().catch(console.error);
