#!/usr/bin/env node
/**
 * TAISUN Workflow Lint - ワークフロー/ポリシー定義検証
 *
 * このスクリプトはワークフロー定義を検証し、
 * 誤定義による事故を防ぎます。
 *
 * 検証項目:
 * 1. 必須フェーズの存在確認（Phase 5, 7 等）
 * 2. 禁止ツールの参照チェック
 * 3. スキルファイルの存在確認
 * 4. マッピング設定の整合性チェック
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');

// 検証結果
const results = {
  errors: [],
  warnings: [],
  passed: []
};

function log(type, message) {
  results[type].push(message);
}

// 1. マッピング設定の検証
function validateMapping() {
  const mappingPath = path.join(__dirname, 'task-skill-mapping.json');

  if (!fs.existsSync(mappingPath)) {
    log('errors', 'task-skill-mapping.json が見つかりません');
    return false;
  }

  try {
    const data = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

    // mappingsの検証
    if (!data.mappings || !Array.isArray(data.mappings)) {
      log('errors', 'mappings が配列として定義されていません');
      return false;
    }

    for (const mapping of data.mappings) {
      // task_patternsの検証
      if (!mapping.task_patterns || !Array.isArray(mapping.task_patterns)) {
        log('errors', `マッピングに task_patterns がありません: ${JSON.stringify(mapping)}`);
        continue;
      }

      // 正規表現の検証
      for (const pattern of mapping.task_patterns) {
        try {
          new RegExp(pattern, 'i');
        } catch (e) {
          log('errors', `無効な正規表現: "${pattern}" - ${e.message}`);
        }
      }

      // スキルパスの検証
      if (mapping.skill_path) {
        const skillPath = path.join(ROOT_DIR, mapping.skill_path);
        if (!fs.existsSync(skillPath)) {
          log('warnings', `スキルファイルが見つかりません: ${mapping.skill_path}`);
        } else {
          log('passed', `スキルファイル確認OK: ${mapping.skill_path}`);
        }
      }

      // 必須ルールの検証
      if (mapping.required_rules) {
        for (const rule of mapping.required_rules) {
          const rulePath = path.join(ROOT_DIR, rule);
          if (!fs.existsSync(rulePath)) {
            log('warnings', `ルールファイルが見つかりません: ${rule}`);
          } else {
            log('passed', `ルールファイル確認OK: ${rule}`);
          }
        }
      }
    }

    // forbidden_toolsの検証
    if (data.forbidden_tools) {
      for (const tool of data.forbidden_tools) {
        if (!tool.tool_pattern) {
          log('errors', 'forbidden_tools に tool_pattern がありません');
        }
        if (!tool.reason) {
          log('warnings', 'forbidden_tools に reason がありません');
        }

        try {
          new RegExp(tool.tool_pattern, 'i');
        } catch (e) {
          log('errors', `無効な正規表現（forbidden_tools）: "${tool.tool_pattern}"`);
        }
      }
    }

    // workflow_phasesの検証
    if (data.workflow_phases) {
      const wp = data.workflow_phases;

      if (wp.mandatory_phases && Array.isArray(wp.mandatory_phases)) {
        log('passed', `必須フェーズ定義: Phase ${wp.mandatory_phases.join(', ')}`);
      }
    }

    return true;
  } catch (e) {
    log('errors', `task-skill-mapping.json の解析エラー: ${e.message}`);
    return false;
  }
}

// 2. CLAUDE.mdの整合性チェック
function validateClaudeMd() {
  const claudeMdPath = path.join(ROOT_DIR, '.claude/CLAUDE.md');

  if (!fs.existsSync(claudeMdPath)) {
    log('warnings', 'CLAUDE.md が見つかりません');
    return false;
  }

  const content = fs.readFileSync(claudeMdPath, 'utf8');

  // PIL禁止の記載確認
  if (!content.includes('PIL') || !content.includes('禁止')) {
    log('warnings', 'CLAUDE.md に PIL 禁止の記載がありません');
  } else {
    log('passed', 'CLAUDE.md に PIL 禁止の記載あり');
  }

  // Phase 5, 7 スキップ禁止の記載確認
  if (!content.includes('Phase 5') || !content.includes('スキップ禁止')) {
    log('warnings', 'CLAUDE.md に Phase 5 スキップ禁止の記載が不明確');
  }

  if (!content.includes('Phase 7') || !content.includes('スキップ禁止')) {
    log('warnings', 'CLAUDE.md に Phase 7 スキップ禁止の記載が不明確');
  }

  // スキル選択ガイドの存在確認
  if (content.includes('スキル選択ガイド')) {
    log('passed', 'スキル選択ガイドが定義されています');
  } else {
    log('warnings', 'スキル選択ガイドが見つかりません');
  }

  return true;
}

// 3. NanoBanana ルールファイルの検証
function validateNanoBananaRules() {
  const rulesPath = path.join(ROOT_DIR, '.claude/NANOBANANA_IMAGE_TO_IMAGE_RULES.md');

  if (!fs.existsSync(rulesPath)) {
    log('errors', 'NANOBANANA_IMAGE_TO_IMAGE_RULES.md が見つかりません');
    return false;
  }

  const content = fs.readFileSync(rulesPath, 'utf8');

  // FAL API禁止の記載確認
  if (content.includes('FAL') && content.includes('禁止')) {
    log('passed', 'FAL API 禁止ルールが定義されています');
  } else {
    log('warnings', 'FAL API 禁止ルールが不明確');
  }

  // Image-to-Image必須の記載確認
  if (content.includes('Image-to-Image') && content.includes('必須')) {
    log('passed', 'Image-to-Image 必須ルールが定義されています');
  } else {
    log('warnings', 'Image-to-Image 必須ルールが不明確');
  }

  return true;
}

// 4. スキルファイルの存在確認
function validateSkillFiles() {
  const skillsDir = path.join(ROOT_DIR, '.claude/skills');

  if (!fs.existsSync(skillsDir)) {
    log('warnings', 'skills ディレクトリが見つかりません');
    return false;
  }

  const requiredSkills = [
    'youtubeschool-creator/SKILL.md',
    'videojson_pipeline/CLAUDE.md',
    'narration_generator/CLAUDE.md',
    'render_generator/CLAUDE.md'
  ];

  for (const skill of requiredSkills) {
    const skillPath = path.join(skillsDir, skill);
    if (fs.existsSync(skillPath)) {
      log('passed', `スキルファイル存在: ${skill}`);
    } else {
      log('warnings', `スキルファイルが見つかりません: ${skill}`);
    }
  }

  return true;
}

// メイン実行
function main() {
  console.log('🔍 [TAISUN Workflow Lint] 検証開始...\n');

  validateMapping();
  validateClaudeMd();
  validateNanoBananaRules();
  validateSkillFiles();

  // 結果出力
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 検証結果サマリー');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (results.errors.length > 0) {
    console.log('❌ エラー:');
    results.errors.forEach(e => console.log(`   - ${e}`));
    console.log('');
  }

  if (results.warnings.length > 0) {
    console.log('⚠️  警告:');
    results.warnings.forEach(w => console.log(`   - ${w}`));
    console.log('');
  }

  if (results.passed.length > 0) {
    console.log('✅ 通過:');
    results.passed.forEach(p => console.log(`   - ${p}`));
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`合計: ${results.errors.length} エラー, ${results.warnings.length} 警告, ${results.passed.length} 通過`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // エラーがある場合は終了コード1
  if (results.errors.length > 0) {
    console.log('🚨 エラーがあります。修正してから再実行してください。');
    process.exit(1);
  }

  console.log('✨ Lint 完了（エラーなし）');
  process.exit(0);
}

// コマンドライン引数の処理
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
TAISUN Workflow Lint - ワークフロー/ポリシー定義検証

使い方:
  node workflow-lint.js           # 検証実行
  node workflow-lint.js --help    # このヘルプを表示
  node workflow-lint.js --ci      # CI モード（エラー時に終了コード1）

検証項目:
  1. task-skill-mapping.json の整合性
  2. CLAUDE.md の必須項目
  3. NANOBANANA_IMAGE_TO_IMAGE_RULES.md の検証
  4. スキルファイルの存在確認
`);
  process.exit(0);
}

main();
