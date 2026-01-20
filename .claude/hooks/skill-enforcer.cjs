#!/usr/bin/env node
/**
 * TAISUN Skill Enforcer - タスク種別→スキル強制ゲート
 *
 * このスクリプトは Claude Code の user-prompt-submit フックとして動作し、
 * ユーザーのプロンプトを分析して適切なスキル使用を強制します。
 *
 * 機能:
 * 1. タスク種別を検出（正規表現マッチング）
 * 2. 該当するスキルを特定
 * 3. スキル使用を強制（ブロッキング）
 * 4. 禁止ツールの使用を検出・警告
 */

const fs = require('fs');
const path = require('path');

// マッピング設定を読み込み
const MAPPING_PATH = path.join(__dirname, 'task-skill-mapping.json');

function loadMapping() {
  try {
    const data = fs.readFileSync(MAPPING_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error(`[TAISUN] マッピング設定の読み込みに失敗: ${e.message}`);
    return null;
  }
}

function detectTaskType(prompt, mappings) {
  const matches = [];

  for (const mapping of mappings) {
    for (const pattern of mapping.task_patterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(prompt)) {
        matches.push({
          pattern,
          mapping
        });
        break; // 1つのマッピングにつき1回マッチすれば十分
      }
    }
  }

  return matches;
}

function checkForbiddenTools(prompt, forbiddenTools) {
  const violations = [];

  for (const tool of forbiddenTools) {
    const regex = new RegExp(tool.tool_pattern, 'i');
    if (regex.test(prompt)) {
      violations.push(tool);
    }
  }

  return violations;
}

function main() {
  // 標準入力からプロンプトを読み込み
  let input = '';

  try {
    input = fs.readFileSync(0, 'utf8');
  } catch (e) {
    // 入力がない場合は終了
    process.exit(0);
  }

  let hookData;
  try {
    hookData = JSON.parse(input);
  } catch (e) {
    // JSONパースに失敗した場合は終了
    process.exit(0);
  }

  const prompt = hookData.prompt || hookData.message || '';

  if (!prompt) {
    process.exit(0);
  }

  const config = loadMapping();
  if (!config) {
    process.exit(0);
  }

  // タスク種別を検出
  const taskMatches = detectTaskType(prompt, config.mappings);

  // 禁止ツールをチェック
  const violations = checkForbiddenTools(prompt, config.forbidden_tools || []);

  // 結果を構築
  const result = {
    continue: true,
    messages: []
  };

  // 禁止ツール違反がある場合
  if (violations.length > 0) {
    result.messages.push({
      type: 'warning',
      content: `\n🚨 [TAISUN] 禁止ツール検出:\n${violations.map(v => `  - ${v.reason}`).join('\n')}\n`
    });
  }

  // タスクマッチがある場合
  if (taskMatches.length > 0) {
    const blockingMatches = taskMatches.filter(m => m.mapping.blocking);

    for (const match of taskMatches) {
      const m = match.mapping;

      if (m.required_skill) {
        result.messages.push({
          type: m.blocking ? 'error' : 'warning',
          content: `\n📋 [TAISUN] タスク検出: "${match.pattern}"
  → 必須スキル: ${m.required_skill}
  → スキルパス: ${m.skill_path}
  ${m.blocking ? '⛔ このスキルを使用しないと作業を開始できません' : ''}
`
        });
      }

      if (m.required_rules) {
        result.messages.push({
          type: 'info',
          content: `\n📖 [TAISUN] 必須ルールファイル:\n${m.required_rules.map(r => `  - ${r}`).join('\n')}\n`
        });
      }
    }

    // ブロッキングマッチがある場合、スキル使用を強制
    if (blockingMatches.length > 0) {
      const skillNames = blockingMatches
        .map(m => m.mapping.required_skill)
        .filter(Boolean)
        .join(', ');

      result.messages.push({
        type: 'system',
        content: `\n⚠️ [TAISUN 強制ゲート]
このタスクには以下のスキルの使用が必須です: ${skillNames}

Claude Codeへの指示:
1. まず該当スキルのSKILL.mdを読む
2. スキルに定義されたワークフローに従う
3. 勝手に別のワークフローを使用しない

スキルを使用せずに作業を開始した場合、
ユーザーに AskUserQuestion で確認を求めてください。
`
      });
    }
  }

  // 結果を出力
  if (result.messages.length > 0) {
    console.log(result.messages.map(m => m.content).join('\n'));
  }

  process.exit(0);
}

main();
